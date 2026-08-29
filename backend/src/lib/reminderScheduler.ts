import { prisma } from "./prisma";
import {
  currentTimeInTimezone,
  formatDateInTimezone,
  getDayRangeUtc,
  timeInTimezone,
  todayInTimezone,
} from "./timezone";
import { sendPushNotification } from "./webPush";
import { shouldSendReminder } from "./reminderEligibility";
import { cronSlotsForDate } from "./cron";
import type { Reminder } from "../generated/prisma/client";

// How often to check whether any reminder's time has arrived. Not the same thing as how
// precisely a reminder fires - shouldSendReminder's own "fire on the first tick at/after the
// time, then never again for that (reminder, day, time)" logic is what actually keeps this
// correct regardless of tick frequency; this interval just trades notification punctuality
// against how many times a minute this process re-scans every enabled reminder's own local clock.
const TICK_INTERVAL_MS = 5 * 60 * 1000;

const APP_TITLE = "WellTrack";

// How long an expired reminder stays in the table before being removed for good.
//
// Swept at all because an expired reminder is dead weight - it can never fire again, and
// routes/reminders.ts's own DELETE already establishes that a Reminder has no historical value
// once it's gone (unlike a log, there is nothing anyone would look back on). Swept a day later
// rather than the instant it lapses so that a "for the rest of today" reminder is still visible,
// and visibly finished, for the day it ran: disappearing at the stroke of midnight would leave
// someone wondering whether it had ever been created at all.
export const EXPIRED_REMINDER_RETENTION_MS = 24 * 60 * 60 * 1000;

// Removes reminders whose expiry passed more than EXPIRED_REMINDER_RETENTION_MS ago. Deliberately
// scoped to rows that genuinely have an expiry set - a standing reminder (expiresAt null) is never
// a candidate, and `lt` on a null column never matches anyway, so this cannot touch one even if
// the filter were wrong.
//
// Cascades to that reminder's ReminderSend rows (see schema.prisma), which is correct: those exist
// solely as an idempotency guard for a reminder that no longer exists.
async function sweepExpiredReminders(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - EXPIRED_REMINDER_RETENTION_MS);
  await prisma.reminder.deleteMany({ where: { expiresAt: { not: null, lt: cutoff } } });
}

type ReminderWithTargets = Reminder & {
  user: { timezone: string };
  category: { name: string; description: string | null } | null;
};

// The notification's actual text depends on what the reminder is about - a generic "you haven't
// logged anything" body would be actively wrong for a reminder specifically about Diazepam.
// `description` is included alongside a category's own name for exactly the same reason a former
// Medication reminder used to append its dosage (e.g. "Diazepam (2mg)") - see
// docs/log/19-medication-to-category.md for why a former medication's dosage now lives there.
function reminderCopy(reminder: ReminderWithTargets): { title: string; body: string } {
  switch (reminder.target) {
    case "GENERAL":
      return { title: APP_TITLE, body: "You haven't logged anything today yet." };
    case "CATEGORY": {
      const name = reminder.category?.name ?? "your category";
      const label = reminder.category?.description
        ? `${name} (${reminder.category.description})`
        : name;
      return { title: APP_TITLE, body: `Time to log ${label}.` };
    }
  }
}

// Whether the user has already logged against this specific reminder's own target yet today -
// GENERAL is a blanket "any category log at all" check; CATEGORY is scoped to the specific
// category this reminder is about (a "Diazepam" reminder isn't satisfied by logging
// "Sertraline" - both are now their own categories, see docs/log/19-medication-to-category.md).
async function hasLoggedTarget(
  reminder: ReminderWithTargets,
  userId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const where = { userId, loggedAt: { gte: start, lt: end } };

  switch (reminder.target) {
    case "GENERAL":
      return (await prisma.categoryLog.findFirst({ where, select: { id: true } })) !== null;
    case "CATEGORY":
      return (
        (await prisma.categoryLog.findFirst({
          where: { ...where, categoryId: reminder.categoryId as string },
          select: { id: true },
        })) !== null
      );
  }
}

// Every "HH:mm" slot this reminder's schedules produce on the given local date, deduplicated and
// ascending - two expressions can legitimately overlap on one day (e.g. a weekday rule and a
// specific-date rule), and the same slot must never be treated as two separate firings.
//
// A stored expression that no longer parses is skipped rather than thrown: expressions are
// validated at the API boundary (see routes/reminders.ts), so this shouldn't happen - but if one
// ever did get in, one user's bad row must not stop the tick that serves everyone else.
function slotsForToday(schedules: string[], dateStr: string, reminderId: string): string[] {
  const slots = new Set<string>();
  for (const expression of schedules) {
    try {
      for (const slot of cronSlotsForDate(expression, dateStr)) slots.add(slot);
    } catch (err) {
      console.error(
        `Skipping unparseable schedule on reminder ${reminderId}: "${expression}"`,
        err,
      );
    }
  }
  return [...slots].sort();
}

async function sendReminderToUser(
  userId: string,
  payload: { title: string; body: string },
): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  for (const subscription of subscriptions) {
    const { gone } = await sendPushNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
    );

    // The browser's own push service reports this endpoint no longer exists (410 Gone) or was
    // never valid (404) - the standard signal a user unsubscribed, uninstalled, or cleared site
    // data without this app ever being told directly. Nothing will ever succeed against it
    // again, so it's cleaned up here rather than left to fail silently on every future tick.
    if (gone) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
    }
  }
}

// One full pass over every enabled reminder - exported on its own (not just wrapped in the
// interval below) specifically so a test can call it directly, deterministically, without
// waiting on a real timer.
export async function runReminderTick(): Promise<void> {
  // One "now" for the whole pass, so the sweep and the expiry filter below can't disagree with
  // each other about what time it is.
  const now = new Date();
  await sweepExpiredReminders(now);

  const reminders = await prisma.reminder.findMany({
    // A temporary reminder ("nudge me every 30 minutes for the rest of today") simply stops being
    // a candidate once its expiry passes. Nothing else about it is special: while it is live it
    // goes through exactly the same slot expansion, same already-sent guard and same
    // has-this-been-logged check as any other reminder.
    where: {
      enabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      // A reminder that hasn't started yet is not a candidate at all. Filtered here rather than
      // per-slot below because it is exact and cheap: startsAt is an instant, and so is now.
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
    },
    include: {
      user: { select: { timezone: true } },
      category: { select: { name: true, description: true } },
    },
  });

  if (reminders.length === 0) return;

  // "Today" is resolved per-user (not once globally) - two users in different timezones can
  // genuinely have a different calendar day at the same real instant.
  const todayByUserId = new Map<string, string>();
  for (const reminder of reminders) {
    if (!todayByUserId.has(reminder.userId)) {
      todayByUserId.set(reminder.userId, todayInTimezone(reminder.user.timezone));
    }
  }

  // Every ReminderSend for today, across every candidate reminder, fetched in one batched query
  // rather than one query per (reminder, time) pair - the same "one query, filter in memory"
  // shape hasLoggedTarget's own GENERAL case already uses across its five tables.
  const sentToday = await prisma.reminderSend.findMany({
    where: {
      reminderId: { in: reminders.map((r) => r.id) },
      date: { in: [...new Set(todayByUserId.values())] },
    },
    select: { reminderId: true, date: true, time: true },
  });
  const sentSlotKey = (reminderId: string, date: string, time: string) =>
    `${reminderId}|${date}|${time}`;
  const sentSet = new Set(sentToday.map((s) => sentSlotKey(s.reminderId, s.date, s.time)));

  for (const reminder of reminders as ReminderWithTargets[]) {
    const today = todayByUserId.get(reminder.userId) as string;
    const currentLocalTime = currentTimeInTimezone(reminder.user.timezone);

    let todaysSlots = slotsForToday(reminder.schedules, today, reminder.id);

    // On the day a reminder starts, the slots earlier than its start time have not "already
    // passed" - they were never its slots at all. Without this the scheduler's own fire-late rule
    // (see reminderEligibility.ts) would deliver a one-shot for 03:46 the moment it was created at
    // 21:46 the evening before, which is the entire failure startsAt exists to prevent.
    //
    // Only the start *day* needs filtering: on any later day every slot is legitimately after it.
    if (reminder.startsAt) {
      const startDate = formatDateInTimezone(reminder.startsAt, reminder.user.timezone);
      if (today === startDate) {
        const startTime = timeInTimezone(reminder.startsAt, reminder.user.timezone);
        todaysSlots = todaysSlots.filter((time) => time >= startTime);
      }
    }

    // Skip the "has this been logged" query entirely if nothing on this reminder could possibly
    // be due yet, or everything due has already fired - true for most reminders on most ticks,
    // so this keeps a 5-minute tick cheap regardless of how many reminders exist overall. Also
    // covers the "this expression doesn't fire today at all" case (a weekday rule on a Saturday),
    // which is now a normal, common outcome rather than an impossible one.
    const hasCandidateTime = todaysSlots.some(
      (time) => currentLocalTime >= time && !sentSet.has(sentSlotKey(reminder.id, today, time)),
    );
    if (!hasCandidateTime) continue;

    // A reminder that doesn't stop when logged never asks the question at all - it fires on its
    // schedule regardless, which is the entire difference between "nudge me until I do it" and
    // "nudge me on a rhythm". Skipping the query rather than discarding its answer also keeps a
    // repeating reminder from doing a pointless read on every tick.
    let loggedTarget = false;
    if (reminder.stopsWhenLogged) {
      const { start, end } = getDayRangeUtc(today, reminder.user.timezone);
      loggedTarget = await hasLoggedTarget(reminder, reminder.userId, start, end);
    }

    const eligible = todaysSlots.filter((time) =>
      shouldSendReminder({
        time,
        currentLocalTime,
        alreadySentThisSlot: sentSet.has(sentSlotKey(reminder.id, today, time)),
        hasLoggedTarget: loggedTarget,
      }),
    );
    if (eligible.length === 0) continue;

    // Only the most recent due slot actually notifies; every earlier one is recorded as handled
    // without sending. Firing late is still deliberate (see reminderEligibility.ts - better a late
    // reminder than none after a restart), but firing *every* missed slot at once is not: an
    // hourly schedule whose process was down until 14:00 would otherwise deliver fifteen identical
    // notifications in one burst. This behaviour only became reachable when schedules stopped
    // being a hand-typed list capped at six times - see docs/log/25-cron-reminder-schedules.md.
    await sendReminderToUser(reminder.userId, reminderCopy(reminder));

    for (const time of eligible) {
      await prisma.reminderSend.create({
        data: { reminderId: reminder.id, date: today, time },
      });
      sentSet.add(sentSlotKey(reminder.id, today, time));
    }
  }
}

// Started once from index.ts, after the server starts listening. Skipped when
// NODE_ENV === "test" - the same convention rateLimiter.ts already uses - so the test suite
// never has a real background interval running against its own throwaway test data.
export function startReminderScheduler(): void {
  if (process.env.NODE_ENV === "test") return;

  setInterval(() => {
    runReminderTick().catch((err) => {
      // A single tick failing (e.g. a transient database blip) shouldn't crash the whole
      // process or stop future ticks from ever running again - logged the same way
      // errorHandler.ts logs an unexpected request failure, for whoever's diagnosing it later.
      console.error("Reminder scheduler tick failed:", err);
    });
  }, TICK_INTERVAL_MS);
}

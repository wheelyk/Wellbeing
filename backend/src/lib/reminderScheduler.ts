import { prisma } from "./prisma";
import { currentTimeInTimezone, getDayRangeUtc, todayInTimezone } from "./timezone";
import { sendPushNotification } from "./webPush";
import { shouldSendReminder } from "./reminderEligibility";
import type { Reminder } from "../generated/prisma/client";

// How often to check whether any reminder's time has arrived. Not the same thing as how
// precisely a reminder fires - shouldSendReminder's own "fire on the first tick at/after the
// time, then never again for that (reminder, day, time)" logic is what actually keeps this
// correct regardless of tick frequency; this interval just trades notification punctuality
// against how many times a minute this process re-scans every enabled reminder's own local clock.
const TICK_INTERVAL_MS = 5 * 60 * 1000;

const APP_TITLE = "WellTrack";

type ReminderWithTargets = Reminder & {
  user: { timezone: string };
  medication: { name: string; dosage: string | null } | null;
  category: { name: string } | null;
};

// The notification's actual text depends on what the reminder is about - a generic "you haven't
// logged anything" body would be actively wrong for a reminder specifically about Diazepam.
function reminderCopy(reminder: ReminderWithTargets): { title: string; body: string } {
  switch (reminder.target) {
    case "GENERAL":
      return { title: APP_TITLE, body: "You haven't logged anything today yet." };
    case "MOOD":
      return { title: APP_TITLE, body: "Time to log your mood." };
    case "SYMPTOM":
      return { title: APP_TITLE, body: "Time to log a symptom." };
    case "HABIT":
      return { title: APP_TITLE, body: "Time to log a habit." };
    case "MEDICATION": {
      const name = reminder.medication?.name ?? "your medication";
      const label = reminder.medication?.dosage ? `${name} (${reminder.medication.dosage})` : name;
      return { title: APP_TITLE, body: `Time to take ${label}.` };
    }
    case "CATEGORY":
      return {
        title: APP_TITLE,
        body: `Time to log ${reminder.category?.name ?? "your category"}.`,
      };
  }
}

// Whether the user has already logged against this specific reminder's own target yet today -
// GENERAL keeps the original blanket five-table check; every other target is scoped to just its
// own log table (and, for MEDICATION/CATEGORY, to the specific medication/category this reminder
// is about - a "Diazepam" reminder isn't satisfied by logging "Sertraline").
async function hasLoggedTarget(
  reminder: ReminderWithTargets,
  userId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const where = { userId, loggedAt: { gte: start, lt: end } };

  switch (reminder.target) {
    case "GENERAL": {
      const [mood, symptom, medication, habit, category] = await Promise.all([
        prisma.moodLog.findFirst({ where, select: { id: true } }),
        prisma.symptomLog.findFirst({ where, select: { id: true } }),
        prisma.medicationLog.findFirst({ where, select: { id: true } }),
        prisma.habitLog.findFirst({ where, select: { id: true } }),
        prisma.categoryLog.findFirst({ where, select: { id: true } }),
      ]);
      return (
        mood !== null ||
        symptom !== null ||
        medication !== null ||
        habit !== null ||
        category !== null
      );
    }
    case "MOOD":
      return (await prisma.moodLog.findFirst({ where, select: { id: true } })) !== null;
    case "SYMPTOM":
      return (await prisma.symptomLog.findFirst({ where, select: { id: true } })) !== null;
    case "HABIT":
      return (await prisma.habitLog.findFirst({ where, select: { id: true } })) !== null;
    case "MEDICATION":
      return (
        (await prisma.medicationLog.findFirst({
          where: { ...where, medicationId: reminder.medicationId as string },
          select: { id: true },
        })) !== null
      );
    case "CATEGORY":
      return (
        (await prisma.categoryLog.findFirst({
          where: { ...where, categoryId: reminder.categoryId as string },
          select: { id: true },
        })) !== null
      );
  }
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
  const reminders = await prisma.reminder.findMany({
    where: { enabled: true },
    include: {
      user: { select: { timezone: true } },
      medication: { select: { name: true, dosage: true } },
      category: { select: { name: true } },
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

    // Skip the "has this been logged" query entirely if nothing on this reminder could possibly
    // be due yet, or everything due has already fired - true for most reminders on most ticks,
    // so this keeps a 5-minute tick cheap regardless of how many reminders exist overall.
    const hasCandidateTime = reminder.times.some(
      (time) => currentLocalTime >= time && !sentSet.has(sentSlotKey(reminder.id, today, time)),
    );
    if (!hasCandidateTime) continue;

    const { start, end } = getDayRangeUtc(today, reminder.user.timezone);
    const loggedTarget = await hasLoggedTarget(reminder, reminder.userId, start, end);

    for (const time of reminder.times) {
      const eligible = shouldSendReminder({
        time,
        currentLocalTime,
        alreadySentThisSlot: sentSet.has(sentSlotKey(reminder.id, today, time)),
        hasLoggedTarget: loggedTarget,
      });
      if (!eligible) continue;

      await sendReminderToUser(reminder.userId, reminderCopy(reminder));
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

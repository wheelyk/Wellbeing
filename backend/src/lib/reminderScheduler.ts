import { prisma } from "./prisma";
import { currentTimeInTimezone, getDayRangeUtc, todayInTimezone } from "./timezone";
import { sendPushNotification } from "./webPush";
import { shouldSendReminder } from "./reminderEligibility";

// How often to check whether any user's reminder time has arrived. Not the same thing as how
// precisely a reminder fires - shouldSendReminder's own "fire on the first tick at/after the
// reminder time, then never again that day" logic is what actually keeps this correct regardless
// of tick frequency; this interval just trades notification punctuality against how many times a
// minute this process re-scans every reminder-enabled user's own local clock.
const TICK_INTERVAL_MS = 5 * 60 * 1000;

const REMINDER_TITLE = "WellTrack";
const REMINDER_BODY = "You haven't logged anything today yet.";

// Whether this specific user has logged anything (any of the four types) yet today, in their own
// timezone - a short-circuiting existence check across all four log tables, the same
// per-user-timezone day-boundary resolution (getDayRangeUtc) dashboard.ts's own streak
// calculation already relies on for the identical underlying question.
async function hasLoggedToday(userId: string, today: string, timezone: string): Promise<boolean> {
  const { start, end } = getDayRangeUtc(today, timezone);
  const where = { userId, loggedAt: { gte: start, lt: end } };

  const [mood, symptom, medication, habit, category] = await Promise.all([
    prisma.moodLog.findFirst({ where, select: { id: true } }),
    prisma.symptomLog.findFirst({ where, select: { id: true } }),
    prisma.medicationLog.findFirst({ where, select: { id: true } }),
    prisma.habitLog.findFirst({ where, select: { id: true } }),
    prisma.categoryLog.findFirst({ where, select: { id: true } }),
  ]);

  return (
    mood !== null || symptom !== null || medication !== null || habit !== null || category !== null
  );
}

async function sendReminderToUser(userId: string): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  for (const subscription of subscriptions) {
    const { gone } = await sendPushNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      { title: REMINDER_TITLE, body: REMINDER_BODY },
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

// One full pass over every reminder-enabled user - exported on its own (not just wrapped in the
// interval below) specifically so a test can call it directly, deterministically, without
// waiting on a real timer.
export async function runReminderTick(): Promise<void> {
  const candidates = await prisma.user.findMany({
    where: { reminderEnabled: true, reminderTime: { not: null } },
    select: { id: true, timezone: true, reminderTime: true, lastReminderSentDate: true },
  });

  for (const user of candidates) {
    const today = todayInTimezone(user.timezone);
    const currentLocalTime = currentTimeInTimezone(user.timezone);
    const loggedToday = await hasLoggedToday(user.id, today, user.timezone);

    const eligible = shouldSendReminder({
      reminderEnabled: true,
      reminderTime: user.reminderTime,
      currentLocalTime,
      today,
      lastReminderSentDate: user.lastReminderSentDate,
      hasLoggedToday: loggedToday,
    });

    if (!eligible) continue;

    await sendReminderToUser(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastReminderSentDate: today },
    });
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

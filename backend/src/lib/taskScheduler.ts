import { prisma } from "./prisma";
import { currentTimeInTimezone } from "./timezone";
import { sendPushToUser } from "./pushDelivery";
import { quietHoursHoldUntil } from "./reminderRuns";

// The one-shot sibling of reminderScheduler.ts's own tick - a Task fires exactly once, at its own
// dueAt, rather than on a recurring cron schedule, so there is no slot expansion and no
// per-(reminder, day, time) ReminderSend row to check: `notifiedAt` on the Task itself is the
// entire idempotency guard. See schema.prisma's own comment on Task, and
// docs/log/51-one-off-tasks.md.
//
// Same interval as the reminder tick - punctuality for "due at 12:30" matters the same way it
// does for a recurring reminder's own slot, for the same reason (see reminderScheduler.ts's own
// TICK_INTERVAL_MS comment).
const TICK_INTERVAL_MS = 5 * 60 * 1000;

const APP_TITLE = "WellTrack";

export async function runTaskTick(): Promise<void> {
  const now = new Date();

  const dueTasks = await prisma.task.findMany({
    where: { doneAt: null, notifiedAt: null, dueAt: { lte: now } },
    include: { user: { select: { timezone: true, quietHoursStart: true, quietHoursEnd: true } } },
  });
  if (dueTasks.length === 0) return;

  for (const task of dueTasks) {
    // A task has no per-item `allowDuringQuietHours` override the way a Reminder does (see
    // schema.prisma's own comment: no reminder toggle, no recurrence - it fires once, respecting
    // quiet hours the same way every other notification in this app already does) - `false` here
    // means exactly that: never overridden.
    const currentLocalTime = currentTimeInTimezone(task.user.timezone);
    const held =
      quietHoursHoldUntil(currentLocalTime, false, {
        start: task.user.quietHoursStart,
        end: task.user.quietHoursEnd,
      }) !== null;
    // Held, not skipped-forever: notifiedAt stays null, so the next tick after quiet hours end
    // picks this same task back up and sends it then - the identical "fire late rather than
    // never" behaviour reminderEligibility.ts already documents for a recurring reminder's own
    // slot.
    if (held) continue;

    await sendPushToUser(task.userId, { title: APP_TITLE, body: task.title });
    await prisma.task.update({ where: { id: task.id }, data: { notifiedAt: now } });
  }
}

// Started once from index.ts, after the server starts listening - see
// reminderScheduler.ts's own startReminderScheduler for the identical shape and the identical
// reasoning for skipping this under NODE_ENV === "test".
export function startTaskScheduler(): void {
  if (process.env.NODE_ENV === "test") return;

  setInterval(() => {
    runTaskTick().catch((err) => {
      console.error("Task scheduler tick failed:", err);
    });
  }, TICK_INTERVAL_MS);
}

import { prisma } from "./prisma";
import { SOFT_DELETE_GRACE_PERIOD_MS } from "./categoryPurge";

// How often to sweep for personal categories whose 30-day soft-delete grace period has passed.
// Unlike reminderScheduler.ts's own tick (which has to be frequent enough to catch a specific
// time of day), this only ever needs to notice "more than 30 days have passed" - missing that
// moment by a few hours is harmless, so a much coarser interval is fine here.
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Actually removes a category for real, once DELETE /api/categories/:id (see categories.ts) has
// soft-deleted it and its 30-day grace period has passed - but only if it still has zero logs
// against it by then. A category with real logged history is left alone here and stays
// soft-deleted indefinitely (functionally identical to how Archive already behaved before this
// feature existed) rather than ever silently erasing a health record - see this task's own
// docs/log entry for the reasoning.
export async function runCategoryPurgeTick(): Promise<void> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_GRACE_PERIOD_MS);

  const candidates = await prisma.category.findMany({
    where: {
      userId: { not: null },
      archivedAt: { not: null, lte: cutoff },
    },
    select: { id: true },
  });
  if (candidates.length === 0) return;

  const logCounts = await prisma.categoryLog.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: candidates.map((c) => c.id) } },
    _count: { _all: true },
  });
  const categoryIdsWithLogs = new Set(logCounts.map((row) => row.categoryId));

  for (const candidate of candidates) {
    if (categoryIdsWithLogs.has(candidate.id)) continue;

    // A Reminder's own relation to Category is Restrict, not Cascade (see schema.prisma) - a
    // real delete would fail with a foreign-key error if any Reminder (even a disabled one, from
    // DELETE /:id's own side effect) still points at this category, so it's deleted first, in the
    // same transaction as the category itself so this can't ever leave a Reminder pointing at
    // nothing if the process died in between the two steps.
    await prisma.$transaction([
      prisma.reminder.deleteMany({ where: { categoryId: candidate.id } }),
      prisma.category.delete({ where: { id: candidate.id } }),
    ]);
  }
}

// Started once from index.ts, after the server starts listening - same convention as
// startReminderScheduler, including being skipped in NODE_ENV === "test" so the test suite never
// has a real background interval quietly deleting its own throwaway test data mid-run.
export function startCategoryPurgeScheduler(): void {
  if (process.env.NODE_ENV === "test") return;

  setInterval(() => {
    runCategoryPurgeTick().catch((err) => {
      console.error("Category purge scheduler tick failed:", err);
    });
  }, TICK_INTERVAL_MS);
}

// Shared between categories.ts (which needs to tell the caller *when* a soft-deleted category
// becomes eligible for real removal) and categoryPurgeScheduler.ts (which actually performs that
// removal) - one constant, not two copies that could silently drift apart.
export const SOFT_DELETE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function purgeEligibleAt(archivedAt: Date): Date {
  return new Date(archivedAt.getTime() + SOFT_DELETE_GRACE_PERIOD_MS);
}

import { z } from "zod";

// Shared by every single-table log-list endpoint (medication/category logs - every other former
// log type unified into Category, see docs/log/17-unify-mood-symptom-habit.md) - see history.ts
// for the more involved multi-table version of the same idea. A smaller default than History's
// own (20) since these are meant to back a compact "recent entries" list under a Quick-Add
// button, not a full browsing page.
export const DEFAULT_LOG_LIST_LIMIT = 10;
export const MAX_LOG_LIST_LIMIT = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LOG_LIST_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export interface Page<T> {
  entries: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Fetches one page of an already-`orderBy`'d Prisma query without a separate COUNT(*) - asks
// for one extra row past the page size; if that extra row comes back, there's more to load.
// `fetch` is left to the caller (rather than this helper taking a Prisma delegate directly) so
// it can pass through whatever `where`/`include` a given log type's query already needs.
export async function fetchPage<T>(
  fetch: (args: { take: number; skip: number }) => Promise<T[]>,
  limit: number,
  offset: number,
): Promise<Page<T>> {
  const rows = await fetch({ take: limit + 1, skip: offset });
  const hasMore = rows.length > limit;
  return { entries: rows.slice(0, limit), limit, offset, hasMore };
}

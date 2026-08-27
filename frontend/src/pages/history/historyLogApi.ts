import { apiFetch } from "../../api/client";
import type { CategoryLog } from "../../components/CategoryEntryForm";
import type { Category } from "../../components/CategoryCreateForm";

// The unified GET /api/history endpoint (see backend/src/routes/history.ts) only returns a
// display-ready {label, notes, loggedAt} shape - enough to render the list, but not enough to
// pre-fill a real edit form (e.g. a category entry's label is "Headache: 6/10", which has no
// machine-readable categoryId in it anywhere). The actual structured fields (categoryId/valueX)
// only live on /api/category-logs, so editing has to go back there - see findLogById below for
// how, given the backend can't be touched for this task and it doesn't support a "fetch by id"
// lookup. Reuses the exact same CategoryLog type the Dashboard's own CategoryEntryForm already
// exports, rather than maintaining a second, parallel interface - this is what actually lets
// HistoryEditModal render that same form component directly instead of rebuilding its own.
//
// Medication used to have its own identical pair of helpers here (fetchMedicationLog,
// medicationLabel) until it unified into Category (Phase 19, see
// docs/log/19-medication-to-category.md) - every history entry goes through this one path now.

interface LogPage<T> {
  entries: T[];
  hasMore: boolean;
}

// /api/category-logs only supports limit/offset pagination - there's no "give me the one with
// this id" lookup (adding one would mean touching backend/, out of scope for this task). Entries
// are always returned newest-first, the same order History itself already sorts by, so this pages
// through that same order and stops as soon as either the target id turns up, or the current
// page's oldest entry is already older than `loggedAtHint` (the timestamp the History list already
// has for this entry) - at that point, if the target still existed, it would already have
// appeared on an earlier page.
async function findLogById<T extends { id: string; loggedAt: string }>(
  id: string,
  loggedAtHint: string,
): Promise<T | null> {
  const limit = 100;
  // Generous bound (5,000 most-recent entries) against runaway paging in some unexpected edge
  // case, rather than an unbounded loop.
  const maxPages = 50;
  const targetTime = new Date(loggedAtHint).getTime();

  for (let page = 0, offset = 0; page < maxPages; page += 1, offset += limit) {
    const result = await apiFetch<LogPage<T>>(`/api/category-logs?limit=${limit}&offset=${offset}`);
    const found = result.entries.find((entry) => entry.id === id);
    if (found) return found;

    const oldest = result.entries[result.entries.length - 1];
    if (!result.hasMore || !oldest || new Date(oldest.loggedAt).getTime() < targetTime) {
      return null;
    }
  }
  return null;
}

export function fetchCategoryLog(id: string, loggedAtHint: string): Promise<CategoryLog | null> {
  return findLogById<CategoryLog>(id, loggedAtHint);
}

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/categories");
}

// ---- Label formatting ------------------------------------------------------------------------
// Mirrors backend/src/routes/history.ts's own label builder exactly, so an entry just updated
// through this page's own edit flow can be reflected in HistoryPage's local `entries` list
// immediately - producing the same string the unified endpoint would produce on its next real
// fetch - without needing a full refetch just to pick up a display label.

// Handles the "scale" type (sharing valueNumeric with plain "numeric") too - rendered as
// "value/max" using the category's own scaleMax, matching how dashboard.ts/CategorySection.tsx
// already format a scale category's value.
export function categoryValueLabel(
  log: {
    valueBoolean: boolean | null;
    valueNumeric: number | null;
    valueDurationMinutes: number | null;
  },
  category: { valueType: Category["valueType"]; scaleMax: number | null },
): string {
  if (log.valueBoolean !== null) return log.valueBoolean ? "Done" : "Not done";
  if (log.valueDurationMinutes !== null) return `${log.valueDurationMinutes} min`;
  if (log.valueNumeric !== null) {
    if (category.valueType === "scale" && category.scaleMax !== null) {
      return `${log.valueNumeric}/${category.scaleMax}`;
    }
    return `${log.valueNumeric}`;
  }
  return "—";
}

export function categoryLabel(
  categoryName: string,
  log: Parameters<typeof categoryValueLabel>[0],
  category: Parameters<typeof categoryValueLabel>[1],
): string {
  return `${categoryName}: ${categoryValueLabel(log, category)}`;
}

import { useEffect, useState } from "react";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { apiFetch } from "../api/client";
import { HistoryEditModal } from "./history/HistoryEditModal";
import { ConfirmDeleteModal } from "./history/ConfirmDeleteModal";

export type HistoryEntryType = "mood" | "symptom" | "medication" | "category";

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  label: string;
  notes: string | null;
  loggedAt: string;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<HistoryEntryType, string> = {
  mood: "Mood",
  symptom: "Symptom",
  medication: "Medication",
  // One broad "Category" bucket, not one filter option per category - the backend's own
  // /api/history?type= only supports this same type-level granularity for the other three types
  // too (never "just this one symptom"), so this matches that existing precedent rather than
  // introducing a finer filter dimension nothing else here has. Every former habit's entries
  // fall under this same bucket now, not a dedicated "Habit" filter.
  category: "Category",
};

// Maps a history entry back to the per-type DELETE endpoint that actually owns it - the
// backend's unified /api/history endpoint is read-only, so deleting still goes through the
// same endpoints the Dashboard's Section components already use (see MoodSection.tsx's
// handleDelete for the pattern this follows).
const DELETE_PATH: Record<HistoryEntryType, string> = {
  mood: "/api/mood-logs",
  symptom: "/api/symptom-logs",
  medication: "/api/medication-logs",
  category: "/api/category-logs",
};

// A stable, locale-independent grouping key (unlike a formatted display string, which can
// vary by locale/timezone in ways that would make two entries on the same calendar day sort
// into different groups). Built from the browser's local date parts, not the raw UTC instant,
// so "today" groups correctly regardless of the viewer's timezone.
function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateHeading(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Groups an already-sorted (most-recent-first) flat list into per-day buckets, preserving
// order - a plain Map keeps insertion order, so the first entry seen for a given day decides
// where that day's group appears in the overall list.
function groupByDate(entries: HistoryEntry[]): Array<{ key: string; entries: HistoryEntry[] }> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = dateKey(entry.loggedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return Array.from(groups.entries()).map(([key, groupEntries]) => ({
    key,
    entries: groupEntries,
  }));
}

function buildQuery(
  filters: { type: HistoryEntryType | ""; from: string; to: string },
  offset: number,
) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState<HistoryEntryType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // null means "closed" for both - see HistoryEditModal/ConfirmDeleteModal's own comments on
  // this convention.
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<HistoryEntry | null>(null);

  // Re-fetches from the beginning (offset 0) whenever a filter changes - a filter change means
  // the previously-loaded pages no longer reflect the current query, so they can't just be kept
  // around and appended to.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    apiFetch<HistoryResponse>(`/api/history?${buildQuery({ type: typeFilter, from, to }, 0)}`)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setHasMore(res.hasMore);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter, from, to]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const res = await apiFetch<HistoryResponse>(
        `/api/history?${buildQuery({ type: typeFilter, from, to }, entries.length)}`,
      );
      setEntries((prev) => [...prev, ...res.entries]);
      setHasMore(res.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Purely local, same reasoning as the Dashboard's own per-type sections' handleLoadLess - the
  // extra pages are already sitting in `entries`, so collapsing back to the first one doesn't
  // need a network round-trip, and hasMore is always true afterward since showing "Load less" at
  // all already implies more than PAGE_SIZE entries were fetched.
  function handleLoadLess() {
    setEntries((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  // Delete now goes through a real confirmation dialog (ConfirmDeleteModal, built from this
  // app's own Modal component) instead of window.confirm - handleRequestDelete just opens it;
  // the actual optimistic-delete-with-rollback logic (unchanged from before) lives in
  // handleConfirmDelete, run only once the user confirms in that dialog.
  function handleRequestDelete(entry: HistoryEntry) {
    setDeletingEntry(entry);
  }

  async function handleConfirmDelete() {
    const entry = deletingEntry;
    if (!entry) return;
    setDeletingEntry(null);

    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await apiFetch(`${DELETE_PATH[entry.type]}/${entry.id}`, { method: "DELETE" });
    } catch {
      setEntries(previous);
    }
  }

  // Called by HistoryEditModal once a PATCH succeeds - updates the matching entry in place
  // (matched by id+type, since ids are only unique within a single log type) so the change is
  // visible immediately without a full refetch of /api/history.
  function handleEntrySaved(updated: HistoryEntry) {
    setEntries((prev) =>
      prev.map((e) => (e.id === updated.id && e.type === updated.type ? updated : e)),
    );
    setEditingEntry(null);
  }

  const groups = groupByDate(entries);

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* pb-24/md:pb-8 - see DashboardPage.tsx's equivalent comment: leaves room below `md:` for
          the fixed BottomNav bar so the last entry (or the Load more button) isn't hidden
          behind it. max-w-3xl on mobile matches every other page; md:max-w-4xl/lg:max-w-5xl
          widen the container from there - unlike Dashboard/Trends, History's content is a single
          chronological list with no natural second column, so this doesn't add a grid the way
          those pages' equivalent widening does, but a UI review flagged the page as stranding
          real desktop width unused even so (a narrow single column with a lot of empty space on
          either side isn't "intentional," it's just unfinished). Widening the container still
          gives the filter row and each entry card more breathing room even with one column. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:max-w-4xl md:pb-8 lg:max-w-5xl">
        <h1 className="text-2xl font-semibold text-text">History</h1>
        <p className="mt-2 text-text-muted">
          Browse everything you&apos;ve logged, across mood, symptoms, medications, and categories.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <CollapsibleSection title="Filters" storageKey="history.filters">
            {/* Stacked, full-width fields on mobile (easy to tap, no cramped side-by-side date
                inputs on a narrow screen); a single horizontal row from sm: up, once there's
                actually room for four fields side by side without wrapping unpredictably - see
                the implementation log entry on this app's mobile-first pass. This replaces
                relying on flex-wrap's own default wrapping point (which happened to look
                reasonable before, but wasn't a deliberate breakpoint decision - just wherever the
                fields' natural widths happened to overflow). */}
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="history-type-filter" className="text-sm font-medium text-text">
                  Type
                </label>
                <select
                  id="history-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as HistoryEntryType | "")}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <option value="">All types</option>
                  {(Object.keys(TYPE_LABELS) as HistoryEntryType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="history-from" className="text-sm font-medium text-text">
                  From
                </label>
                <input
                  id="history-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="history-to" className="text-sm font-medium text-text">
                  To
                </label>
                <input
                  id="history-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </div>

              {(typeFilter || from || to) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTypeFilter("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </CollapsibleSection>
        </div>

        <section className="mt-6">
          {loading && <p className="text-text-muted">Loading…</p>}
          {loadError && (
            <p role="alert" className="text-danger">
              Couldn&apos;t load your history. Please try refreshing.
            </p>
          )}
          {!loading && !loadError && entries.length === 0 && (
            <p className="text-text-muted">
              Nothing to show yet — entries you log from the Dashboard will show up here.
            </p>
          )}

          {!loading &&
            !loadError &&
            groups.map((group) => (
              <div key={group.key} className="mt-6 first:mt-0">
                <CollapsibleSection
                  title={dateHeading(group.key)}
                  storageKey={`history.${group.key}`}
                >
                  <ul className="flex flex-col gap-2">
                    {group.entries.map((entry) => (
                      <li
                        key={`${entry.type}-${entry.id}`}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
                      >
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {TYPE_LABELS[entry.type]}
                          </p>
                          <p className="text-text">{entry.label}</p>
                          {entry.notes && <p className="text-sm text-text-muted">{entry.notes}</p>}
                          <p className="text-xs text-text-muted">
                            {new Date(entry.loggedAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setEditingEntry(entry)}
                            aria-label={`Edit ${TYPE_LABELS[entry.type].toLowerCase()} entry from ${new Date(
                              entry.loggedAt,
                            ).toLocaleString()}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleRequestDelete(entry)}
                            aria-label={`Delete ${TYPE_LABELS[entry.type].toLowerCase()} entry from ${new Date(
                              entry.loggedAt,
                            ).toLocaleString()}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              </div>
            ))}

          {!loading && !loadError && (hasMore || entries.length > PAGE_SIZE) && (
            <div className="mt-6 flex justify-center gap-2">
              {hasMore && (
                <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
              {entries.length > PAGE_SIZE && (
                <Button variant="secondary" onClick={handleLoadLess}>
                  Load less
                </Button>
              )}
            </div>
          )}
        </section>
      </main>
      <BottomNav />
      <HistoryEditModal
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={handleEntrySaved}
      />
      <ConfirmDeleteModal
        open={!!deletingEntry}
        title="Delete entry?"
        message={
          deletingEntry
            ? `Delete this ${TYPE_LABELS[deletingEntry.type].toLowerCase()} entry? This can't be undone.`
            : ""
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingEntry(null)}
      />
    </div>
  );
}

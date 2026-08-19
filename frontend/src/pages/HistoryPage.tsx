import { useEffect, useState } from "react";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { apiFetch } from "../api/client";

export type HistoryEntryType = "mood" | "symptom" | "medication" | "habit";

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
  habit: "Habit",
};

// Maps a history entry back to the per-type DELETE endpoint that actually owns it - the
// backend's unified /api/history endpoint is read-only, so deleting still goes through the
// same four endpoints the Dashboard's Section components already use (see MoodSection.tsx's
// handleDelete for the pattern this follows).
const DELETE_PATH: Record<HistoryEntryType, string> = {
  mood: "/api/mood-logs",
  symptom: "/api/symptom-logs",
  medication: "/api/medication-logs",
  habit: "/api/habit-logs",
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

  async function handleDelete(entry: HistoryEntry) {
    const confirmed = window.confirm(
      `Delete this ${TYPE_LABELS[entry.type].toLowerCase()} entry? This can't be undone.`,
    );
    if (!confirmed) return;

    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await apiFetch(`${DELETE_PATH[entry.type]}/${entry.id}`, { method: "DELETE" });
    } catch {
      setEntries(previous);
    }
  }

  const groups = groupByDate(entries);

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">History</h1>
        <p className="mt-2 text-text-muted">
          Browse everything you&apos;ve logged, across mood, symptoms, medications, and habits.
        </p>

        {/* Stacked, full-width fields on mobile (easy to tap, no cramped side-by-side date
            inputs on a narrow screen); a single horizontal row from sm: up, once there's
            actually room for four fields side by side without wrapping unpredictably - see the
            implementation log entry on this app's mobile-first pass. This replaces relying on
            flex-wrap's own default wrapping point (which happened to look reasonable before, but
            wasn't a deliberate breakpoint decision - just wherever the fields' natural widths
            happened to overflow). */}
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
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
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
                  {dateHeading(group.key)}
                </h2>
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
                        {/* TODO(history-edit): wire this up once the pre-filled entry-edit
                            forms land (see Tasks.md Phase 7's "Edit and delete actions
                            available from Dashboard/History for every log type" item) - a
                            parallel task is building those shared, pre-filled forms for all
                            four log types, and duplicating that effort here would create two
                            divergent edit implementations. */}
                        <Button
                          variant="secondary"
                          disabled
                          title="Editing is coming soon"
                          aria-label={`Edit ${TYPE_LABELS[entry.type].toLowerCase()} entry (coming soon)`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleDelete(entry)}
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
              </div>
            ))}

          {!loading && !loadError && hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

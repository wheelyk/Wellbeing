import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../Button";
import { apiFetch } from "../../api/client";
import { formatEntryDateLabel, formatEntryDateTime } from "../../lib/entryDateLabel";
import { useCollapsedState } from "../../hooks/useCollapsedState";
import { listenForDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

interface RecentEntry {
  label: string;
  value: string;
  loggedAt: string;
  categoryId: string;
  icon: string | null;
}

interface RecentEntryPage {
  entries: RecentEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface DashboardSummaryData {
  date: string;
  loggedTodayCount: number;
  recentEntries: RecentEntryPage;
  streak: { current: number; daysLoggedThisWeek: number };
}

const RECENT_ENTRIES_PAGE_SIZE = 10;

// The backend already resolves `date` to a plain "YYYY-MM-DD" string in the user's own
// timezone (see backend/src/routes/dashboard.ts) - this only reformats that same calendar day
// into a friendlier "Monday, August 17, 2026" for display, it never recomputes *which* day it
// is. Parsing with an explicit `T00:00:00Z` and formatting with `timeZone: "UTC"` keeps both
// steps pinned to the same UTC-midnight instant, so a browser sitting in a very different
// timezone from the backend's resolved date can't accidentally shift it to the day before or
// after - the one behavior "just display the string it returns" is meant to protect against.
function formatDisplayDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Fallback only, used when a category was created with no icon of its own set - every entry
// carries its own `icon` (see the render below) now that every loggable thing is a category (see
// docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md).
const FALLBACK_ENTRY_ICON = "⭐";

interface RecentEntryGroup {
  label: string;
  entries: RecentEntry[];
}

// Buckets the already newest-first `entries` list under the same relative-day label shown
// inline on each entry ("Today", "Yesterday", or an actual date - see formatEntryDateLabel),
// so "Recent entries" reads as day-by-day sections instead of one long undifferentiated list.
// `Map` preserves first-seen insertion order, so groups come out newest-first, same as the flat
// list they're built from - no separate sort needed.
function groupEntriesByDay(entries: RecentEntry[]): RecentEntryGroup[] {
  const groups = new Map<string, RecentEntry[]>();
  for (const entry of entries) {
    const label = formatEntryDateLabel(entry.loggedAt);
    const group = groups.get(label);
    if (group) {
      group.push(entry);
    } else {
      groups.set(label, [entry]);
    }
  }
  return Array.from(groups, ([label, groupEntries]) => ({ label, entries: groupEntries }));
}

// How often to silently re-fetch the summary while this card is on screen. This card and the
// Quick Add sections below it (MedicationSection, CategorySection) are siblings in DashboardPage,
// each entirely self-contained and owning its own fetch/state (see their own files) - by design,
// per the existing "adding another log type means adding a new file, not editing shared state"
// pattern already established before this task. That means there's no
// shared store this card can subscribe to for "a new entry was just saved" -
// dashboardEntryChangedEvent.ts (a DOM CustomEvent, the same mechanism
// dashboardQuickAddEvent.ts already uses for the opposite direction) now covers the common case
// instantly (see the listener registered below), without needing a shared store or lifting state
// into any of those components. This interval remains as the fallback for everything that event
// can't see - another tab, another device, or a session resuming after being backgrounded long
// enough to miss the dispatch - so staleness is bounded at POLL_INTERVAL_MS even then.
const POLL_INTERVAL_MS = 10_000;

export function DashboardSummary() {
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);
  // How many recent entries to ask for on every fetch, including background polls - "Load more"
  // grows this instead of appending a separately-tracked page, so a poll tick 10s after clicking
  // it doesn't silently reset the list back down to the first page (see POLL_INTERVAL_MS below).
  // Read via a ref inside fetchSummary rather than closed over directly, since that function is
  // created once (empty effect deps) and would otherwise always see the value from mount.
  const [recentEntriesLimit, setRecentEntriesLimit] = useState(RECENT_ENTRIES_PAGE_SIZE);
  const recentEntriesLimitRef = useRef(recentEntriesLimit);
  recentEntriesLimitRef.current = recentEntriesLimit;
  const { collapsed: recentCollapsed, toggle: toggleRecentCollapsed } =
    useCollapsedState("dashboard.recentEntries");

  useEffect(() => {
    let cancelled = false;

    function fetchSummary() {
      apiFetch<DashboardSummaryData>(`/api/dashboard?limit=${recentEntriesLimitRef.current}`)
        .then((res) => {
          if (!cancelled) {
            setData(res);
            // A successful refresh clears a previous error - e.g. a transient network blip
            // that has since recovered on the next poll shouldn't keep showing a stale error.
            setLoadError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    fetchSummary();
    const intervalId = window.setInterval(fetchSummary, POLL_INTERVAL_MS);
    // Also refetch immediately when the browser tab regains focus - covers the common case of
    // a user switching away (e.g. to another app) and back, without waiting out the interval.
    window.addEventListener("focus", fetchSummary);
    // And refetch immediately whenever any of the Dashboard sections reports its own
    // create/edit/delete just succeeded - see dashboardEntryChangedEvent.ts and the
    // POLL_INTERVAL_MS comment above for why this exists alongside, not instead of, the poll.
    const unsubscribeEntryChanged = listenForDashboardEntryChanged(fetchSummary);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", fetchSummary);
      unsubscribeEntryChanged();
    };
  }, []);

  async function handleLoadMoreRecent() {
    setLoadingMoreRecent(true);
    const nextLimit = recentEntriesLimit + RECENT_ENTRIES_PAGE_SIZE;
    try {
      const res = await apiFetch<DashboardSummaryData>(`/api/dashboard?limit=${nextLimit}`);
      setData(res);
      setRecentEntriesLimit(nextLimit);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMoreRecent(false);
    }
  }

  // Unlike the per-type sections' handleLoadLess (a pure client-side truncation), this one
  // still refetches - this component always asks the backend for exactly `recentEntriesLimit`
  // entries on every fetch, including background polls (see the ref comment above), so shrinking
  // the limit without also refetching would leave it showing a page the *next* poll tick would
  // immediately overwrite back to the larger size anyway.
  async function handleLoadLessRecent() {
    setLoadingMoreRecent(true);
    const nextLimit = Math.max(
      RECENT_ENTRIES_PAGE_SIZE,
      recentEntriesLimit - RECENT_ENTRIES_PAGE_SIZE,
    );
    try {
      const res = await apiFetch<DashboardSummaryData>(`/api/dashboard?limit=${nextLimit}`);
      setData(res);
      setRecentEntriesLimit(nextLimit);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMoreRecent(false);
    }
  }

  const entryGroups = useMemo(() => groupEntriesByDay(data?.recentEntries.entries ?? []), [data]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-text-muted">Loading your summary…</p>
      </section>
    );
  }

  if (loadError || !data) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p role="alert" className="text-danger">
          Couldn&apos;t load your dashboard summary. Please try refreshing.
        </p>
      </section>
    );
  }

  // `loggedTodayCount` (see dashboard.ts) replaces the old medicationSummary-based check - an
  // unbounded, user-extensible category set has no fixed "how many were there to log today"
  // denominator the way the original built-ins did, so a plain count (not an "X/Y taken"
  // breakdown) is the honest summary now that every loggable thing is a category (see
  // docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md). Today's
  // per-category status still surfaces in the Recent entries list below, not as a summary clause
  // of its own.
  const hasLoggedAnything = data.loggedTodayCount > 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      {/* h2, not h1 - DashboardPage's own "Welcome, {name}" heading is the page's one <h1>; this
          card is a section within the page, not a second top-level heading. */}
      <h2 className="text-2xl font-semibold text-text">{formatDisplayDate(data.date)}</h2>

      {hasLoggedAnything ? (
        <p className="mt-2 text-text">
          Logged {data.loggedTodayCount} {data.loggedTodayCount === 1 ? "entry" : "entries"} today
        </p>
      ) : (
        <p className="mt-2 text-text-muted">
          Nothing logged yet today — use one of the Quick Add buttons below to get started.
        </p>
      )}

      {/* Informational tone only, per requirements §7 - a plain sentence, no badges, streak
          counters styled as achievements, or "don't break the chain" language. */}
      <p className="mt-3 text-sm text-text-muted">
        {data.streak.current > 0
          ? `Logging streak: ${data.streak.current} day${data.streak.current === 1 ? "" : "s"}`
          : "No current logging streak"}
        {" · "}
        Logged {data.streak.daysLoggedThisWeek} of 7 days this week
      </p>

      <div className="mt-6">
        {/* Same disclosure pattern as each SectionPanel below (see SectionPanel.tsx) - a full
            SectionPanel wasn't reused here since this card isn't a single "+ Add" section, it's
            the date/summary/streak header plus this list; only the list itself collapses. */}
        <button
          type="button"
          onClick={toggleRecentCollapsed}
          aria-expanded={!recentCollapsed}
          aria-controls="recent-entries-content"
          className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <h3 className="flex-1 text-lg font-semibold text-text">Recent entries</h3>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${recentCollapsed ? "" : "rotate-180"}`}
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {!recentCollapsed && (
          <div id="recent-entries-content" className="mt-3">
            {data.recentEntries.entries.length === 0 ? (
              <p className="text-text-muted">
                You haven&apos;t logged anything yet. Your recent entries will show up here.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {entryGroups.map((group) => (
                  <div key={group.label}>
                    <h4 className="mb-2 text-sm font-semibold text-text-muted">{group.label}</h4>
                    <ul className="flex flex-col gap-2">
                      {group.entries.map((entry, index) => (
                        // Entries have no id of their own in this response - categoryId +
                        // loggedAt + position within the group is unique enough for a stable
                        // React key here without the backend needing to invent a composite id
                        // field.
                        <li
                          key={`${entry.categoryId}-${entry.loggedAt}-${index}`}
                          className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3"
                        >
                          <span className="text-xl" aria-hidden="true">
                            {entry.icon ?? FALLBACK_ENTRY_ICON}
                          </span>
                          <p className="text-text">
                            {entry.label} — {entry.value} — {formatEntryDateTime(entry.loggedAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {(data.recentEntries.hasMore || recentEntriesLimit > RECENT_ENTRIES_PAGE_SIZE) && (
              <div className="mt-4 flex justify-center gap-2">
                {data.recentEntries.hasMore && (
                  <Button
                    variant="secondary"
                    onClick={handleLoadMoreRecent}
                    disabled={loadingMoreRecent}
                  >
                    {loadingMoreRecent ? "Loading…" : "Load more"}
                  </Button>
                )}
                {recentEntriesLimit > RECENT_ENTRIES_PAGE_SIZE && (
                  <Button
                    variant="secondary"
                    onClick={handleLoadLessRecent}
                    disabled={loadingMoreRecent}
                  >
                    {loadingMoreRecent ? "Loading…" : "Load less"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

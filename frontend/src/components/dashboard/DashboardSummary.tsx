import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { listenForDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";
import { dispatchDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";

// Recent entries no longer render here - see the Timeline panel (docs/log/49-timeline-panel.md),
// which now shows every individual past entry (logged and missed) chronologically alongside
// what's coming up. Keeping both would show the same data twice on one page. This card is now the
// page's own top frame: the date, who you are, today's own count, and the "Log an entry for
// today" button that opens CategoryLogger's picker - not a list of entries in its own right.
// `recentEntries` still comes back from GET /api/dashboard (the backend wasn't touched - see that
// entry's own follow-ups) but nothing here reads it any more.
//
// `streak` also still comes back from the same response and is deliberately left unread here too
// (see the interface below, which only lists what this component actually consumes) - dropped
// from the byline per direct feedback that it wasn't earning its place: a bare day-count doesn't
// say much on its own, and this page already answers "what have I kept up with" more usefully via
// Timeline's own missed/logged rows just above. Revisit if a real streak treatment (e.g. a
// dedicated Trends chart) gives the number a place worth reading it in again - see
// docs/log/50-timeline-v2.md.
interface DashboardSummaryData {
  date: string;
  loggedTodayCount: number;
}

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

interface DashboardSummaryProps {
  // The caller's own display name, folded into the byline under the date heading below (see
  // docs/log/48-dashboard-heading-merge.md). Passed in rather than read here via useAuth()
  // directly: DashboardPage already holds it, and this component's entire test suite mocks
  // exactly one fetch call (GET /api/dashboard) - wiring in AuthContext here would pull in
  // AuthProvider's own session-rehydration request too, for a value the caller already has.
  // Optional and rendered defensively (see below), so a caller that doesn't have it yet - or a
  // test that doesn't care - isn't forced to supply one.
  displayName?: string;
}

export function DashboardSummary({ displayName }: DashboardSummaryProps) {
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function fetchSummary() {
      apiFetch<DashboardSummaryData>("/api/dashboard")
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
  // per-category status surfaces in the Timeline panel above, not as a summary clause of its own.
  const hasLoggedAnything = data.loggedTodayCount > 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      {/* The page's one true heading now - see the note in DashboardPage.tsx on what used to sit
          above this instead. */}
      <h1 className="text-2xl font-semibold text-text">{formatDisplayDate(data.date)}</h1>

      {/* The identity byline that replaced DashboardPage's own separate "Welcome, {name}" block.
          displayName is genuinely optional here (see the prop's own comment), so the whole line
          is simply omitted rather than rendering an empty "Welcome back," - unlike before, there
          is nothing else in this byline to keep it worth showing on its own. */}
      {displayName && <p className="mt-1 text-sm text-text-muted">Welcome back, {displayName}</p>}

      {hasLoggedAnything ? (
        <p className="mt-3 text-text">
          Logged {data.loggedTodayCount} {data.loggedTodayCount === 1 ? "entry" : "entries"} today
        </p>
      ) : (
        <p className="mt-3 text-text-muted">Nothing logged yet today.</p>
      )}

      <button
        type="button"
        onClick={() => dispatchDashboardQuickAdd()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs"
        >
          +
        </span>
        Log an entry for today
      </button>
    </section>
  );
}

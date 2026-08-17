import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";

interface MoodLog {
  id: string;
  mood: number;
}

interface RecentEntry {
  type: "mood" | "symptom" | "medication" | "habit";
  label: string;
  value: string;
  loggedAt: string;
}

interface DashboardSummaryData {
  date: string;
  mood: MoodLog | null;
  symptomCount: number;
  medicationSummary: { taken: number; total: number };
  habitSummary: { loggedCount: number; totalHabits: number };
  recentEntries: RecentEntry[];
  streak: { current: number; daysLoggedThisWeek: number };
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

function formatEntryTime(loggedAt: string): string {
  return new Date(loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const ENTRY_TYPE_ICON: Record<RecentEntry["type"], string> = {
  mood: "🙂",
  symptom: "🩺",
  medication: "💊",
  habit: "✅",
};

// How often to silently re-fetch the summary while this card is on screen. This card and the
// four Quick Add sections below it (MoodSection, HabitSection, MedicationSection,
// SymptomSection) are siblings in DashboardPage, each entirely self-contained and owning its
// own fetch/state (see their own files) - by design, per the existing "adding another log type
// means adding a new file, not editing shared state" pattern already established before this
// task. That means there's no shared store this card can subscribe to for "a new entry was just
// saved," and those four components are out of scope for this task to modify (see the PR
// description). Polling is the simplest fix that doesn't require touching any of them or
// introducing a new cross-component event bus: it keeps the card's numbers from silently going
// stale after a Quick Add below it, at the cost of up to POLL_INTERVAL_MS of staleness rather
// than being instant. A real event-driven "just logged something, refetch now" mechanism is a
// reasonable future improvement once/if this app grows a shared data layer, but is unrequested
// speculative scope for this task.
const POLL_INTERVAL_MS = 10_000;

export function DashboardSummary() {
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

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", fetchSummary);
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

  const hasLoggedAnything =
    data.mood !== null ||
    data.symptomCount > 0 ||
    data.medicationSummary.total > 0 ||
    data.habitSummary.loggedCount > 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      {/* h2, not h1 - DashboardPage's own "Welcome, {name}" heading is the page's one <h1>; this
          card is a section within the page, not a second top-level heading. */}
      <h2 className="text-2xl font-semibold text-text">{formatDisplayDate(data.date)}</h2>

      {hasLoggedAnything ? (
        <p className="mt-2 text-text">
          Mood: {data.mood ? `${data.mood.mood}/5` : "Not logged yet"} · Symptoms:{" "}
          {data.symptomCount} logged · Medications: {data.medicationSummary.taken}/
          {data.medicationSummary.total} taken · Habits: {data.habitSummary.loggedCount}/
          {data.habitSummary.totalHabits} logged
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
        <h3 className="mb-3 text-lg font-semibold text-text">Recent entries</h3>
        {data.recentEntries.length === 0 ? (
          <p className="text-text-muted">
            You haven&apos;t logged anything yet. Your recent entries will show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentEntries.map((entry, index) => (
              // Entries have no id of their own in this response (they're a merge across four
              // different tables) - type + loggedAt + position is unique enough for a stable
              // React key here without the backend needing to invent a composite id field.
              <li
                key={`${entry.type}-${entry.loggedAt}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3"
              >
                <span className="text-xl" aria-hidden="true">
                  {ENTRY_TYPE_ICON[entry.type]}
                </span>
                <p className="text-text">
                  {entry.label} — {entry.value} — {formatEntryTime(entry.loggedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

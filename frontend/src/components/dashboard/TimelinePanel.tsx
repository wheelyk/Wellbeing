import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { CollapsibleSection } from "../CollapsibleSection";
import {
  TIMELINE_RANGES,
  describeRun,
  groupRunsByDay,
  mergeRuns,
  stateLabel,
  type RecentResponse,
  type TimelineRange,
  type TimelineRun,
  type TimelineState,
  type UpcomingResponse,
} from "../../lib/timeline";

// "What did I log, what did I miss, and what's coming up" - one merged, chronological list, at the
// top of the Dashboard because it answers the question people open the app to check. It replaces
// two things that used to sit here separately: the Coming Up panel (docs/log/45) and
// DashboardSummary's own Recent Entries list, which duplicated exactly the "past" half of this once
// GET /api/reminders/recent existed (docs/log/47) - see docs/log/49-timeline-panel.md.
//
// Every row comes from one of two server calls. Nothing here expands a cron expression or decides
// whether a reminder fired: the browser has its own cron implementation for drawing the picker,
// and a list built from it would show runs the scheduler never actually sent or will never send.

const PILL_TONE: Record<Exclude<TimelineState, "scheduled">, string> = {
  held: "border-warning/50 bg-warning/10 text-warning",
  logged: "border-success/50 bg-success/10 text-success",
  missed: "border-danger/50 bg-danger/10 text-danger",
  paused: "border-border bg-surface-muted text-text-muted",
};

// How many rows the panel draws before it stops and says how many are left. Not a performance
// limit - both servers already cap their own responses. This is about what the panel is for: a
// glance at the top of the Dashboard, not the full schedule (the range chips are for that). See
// docs/log/45-coming-up-panel.md for the account that made this necessary in the first place.
const VISIBLE_RUNS = 12;

interface TimelineData {
  today: string;
  runs: TimelineRun[];
  truncated: boolean;
}

export function TimelinePanel() {
  const [range, setRange] = useState<TimelineRange>(1);
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Both sides use the same `days` value - see TIMELINE_RANGES's own comment on why that is a
    // deliberate simplification rather than a literal "N days total" window.
    Promise.all([
      apiFetch<RecentResponse>(`/api/reminders/recent?days=${range}`),
      apiFetch<UpcomingResponse>(`/api/reminders/upcoming?days=${range}`),
    ])
      .then(([recent, upcoming]) => {
        if (cancelled) return;
        setData({
          // recent.today and upcoming.today should always agree (same account, same instant,
          // give or take the gap between two requests) - upcoming's is used simply because it is
          // the side nearer "now", for the rare case a request lands exactly on a midnight
          // rollover between the two.
          today: upcoming.today,
          runs: mergeRuns(recent.runs, upcoming.runs),
          truncated: recent.truncated || upcoming.truncated,
        });
        setLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const shown = data ? data.runs.slice(0, VISIBLE_RUNS) : [];
  const hidden = data ? data.runs.length - shown.length : 0;
  const days = data ? groupRunsByDay(shown, data.today) : [];
  const rangeLabel =
    TIMELINE_RANGES.find((r) => r.days === range)?.label.toLowerCase() ?? "this period";

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <CollapsibleSection
        title="Timeline"
        storageKey="dashboard.timeline"
        headerClassName="p-4"
        contentClassName="border-t border-border p-4 pt-3"
        // The count is the point of a collapsed panel: "Timeline · 5" is worth a glance, "Timeline
        // ⌄" is not. Absent while loading rather than showing a placeholder 0, which would read
        // as "nothing here" for as long as the request takes.
        meta={data ? data.runs.length : undefined}
        subtitle={data && data.runs.length === 0 ? `Nothing to show ${rangeLabel}` : undefined}
      >
        <div role="group" aria-label="How far to look" className="flex flex-wrap gap-2 pb-1">
          {TIMELINE_RANGES.map((option) => (
            <button
              key={option.days}
              type="button"
              aria-pressed={range === option.days}
              onClick={() => setRange(option.days)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                range === option.days
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading && <p className="mt-3 text-text-muted">Loading…</p>}

        {loadError && (
          <p role="alert" className="mt-3 text-danger">
            Couldn&apos;t load your timeline. Please try refreshing.
          </p>
        )}

        {!loading && !loadError && data && data.runs.length === 0 && (
          <p className="mt-3 text-text-muted">Nothing logged, missed, or scheduled {rangeLabel}.</p>
        )}

        {!loading &&
          !loadError &&
          days.map((day) => {
            // Only the Today group can ever need a NOW divider - every other day is wholly past
            // or wholly future, by construction (recent only ever returns days up to and including
            // today; upcoming only ever returns today onward). Split on `when` rather than
            // re-deriving "already happened" from the run's own time, since `when` is exactly that
            // answer, decided once at the point the two responses were merged.
            const isToday = day.date === data?.today;
            const past = isToday ? day.runs.filter((r) => r.when === "past") : day.runs;
            const future = isToday ? day.runs.filter((r) => r.when === "future") : [];

            return (
              <div key={day.date} className="mt-3">
                <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                  {day.label}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {past.map((run) => (
                    <TimelineRow key={`${run.reminderId}-${run.date}-${run.time}`} run={run} />
                  ))}
                </ul>
                {isToday && (
                  <div className="my-2 flex items-center gap-2" aria-hidden="true">
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full border border-brand px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-brand">
                      NOW
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <ul className="flex flex-col gap-2">
                  {future.map((run) => (
                    <TimelineRow key={`${run.reminderId}-${run.date}-${run.time}`} run={run} />
                  ))}
                </ul>
              </div>
            );
          })}

        {hidden > 0 && (
          <p className="mt-3 text-xs text-text-muted">
            {/* The count in the header is the real total, so this says what is not on screen
                rather than repeating it. `truncated` means a server capped its own list too, so
                the number below is a floor rather than an exact remainder. */}
            …and {hidden} more{data?.truncated ? " (at least)" : ""}.
          </p>
        )}
      </CollapsibleSection>
    </section>
  );
}

function TimelineRow({ run }: { run: TimelineRun }) {
  const detail = describeRun(run);
  const pill = stateLabel(run.state);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2">
      {/* tabular-nums so the times line up as a column rather than jittering with the width of
          each digit. */}
      <span className="shrink-0 text-sm font-medium tabular-nums text-text">{run.time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text">
          {run.category
            ? `${run.category.icon ? `${run.category.icon} ` : ""}${run.category.name}`
            : "Anything at all"}
        </span>
        {detail && <span className="block truncate text-xs text-text-muted">{detail}</span>}
      </span>
      {pill && (
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
            PILL_TONE[run.state as Exclude<TimelineState, "scheduled">]
          }`}
        >
          {pill}
        </span>
      )}
    </li>
  );
}

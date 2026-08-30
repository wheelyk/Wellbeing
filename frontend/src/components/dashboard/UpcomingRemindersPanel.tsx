import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { CollapsibleSection } from "../CollapsibleSection";
import {
  UPCOMING_RANGES,
  describeRun,
  groupRunsByDay,
  stateLabel,
  type UpcomingRange,
  type UpcomingResponse,
  type UpcomingState,
} from "../../lib/upcoming";

// "What will remind me, and when?" - a merged, chronological list across every reminder, at the top
// of the Dashboard because it is the thing you open the app to check. Until now the only way to
// answer it was to open one category's bell and read one schedule.
//
// Every row comes from the server (see docs/log/42-upcoming-reminders.md). Nothing here expands a
// cron expression, deliberately: the browser has its own cron implementation for drawing the
// picker, and a list built from it would show runs the scheduler will never actually send.

// Semantic colour, separate from the brand accent. "Held" is the one that carries real information
// - it means the notification is coming later, not that it was lost.
// How many runs the panel draws before it stops and says how many are left.
//
// Not a performance limit - the server already caps the response. This is about what the panel
// is for. It sits at the top of the Dashboard to answer "what is next" at a glance, and a single
// hourly reminder turns "today" into thirty-seven rows, which is a scroll rather than an answer.
// Found by pointing it at a real account with an hourly reminder; no test would have said so.
const VISIBLE_RUNS = 12;

const PILL_TONE: Record<Exclude<UpcomingState, "scheduled">, string> = {
  held: "border-warning/50 bg-warning/10 text-warning",
  logged: "border-success/50 bg-success/10 text-success",
  paused: "border-border bg-surface-muted text-text-muted",
};

export function UpcomingRemindersPanel() {
  const [range, setRange] = useState<UpcomingRange>(1);
  const [data, setData] = useState<UpcomingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<UpcomingResponse>(`/api/reminders/upcoming?days=${range}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
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
    UPCOMING_RANGES.find((r) => r.days === range)?.label.toLowerCase() ?? "this period";

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <CollapsibleSection
        title="Coming up"
        storageKey="dashboard.upcoming"
        headerClassName="p-4"
        contentClassName="border-t border-border p-4 pt-3"
        // The count is the point of a collapsed panel: "Coming up · 5" is worth a glance, "Coming
        // up ⌄" is not. Absent while loading rather than showing a placeholder 0, which would read
        // as "nothing due" for as long as the request takes.
        meta={data ? data.runs.length : undefined}
        subtitle={data && data.runs.length === 0 ? `Nothing due ${rangeLabel}` : undefined}
      >
        <div role="group" aria-label="How far ahead to look" className="flex flex-wrap gap-2 pb-1">
          {UPCOMING_RANGES.map((option) => (
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
            Couldn&apos;t work out what&apos;s coming up. Please try refreshing.
          </p>
        )}

        {!loading && !loadError && data && data.runs.length === 0 && (
          <p className="mt-3 text-text-muted">
            Nothing scheduled{" "}
            {rangeLabel === "today" ? "for the rest of today" : `in the next ${rangeLabel}`}.
          </p>
        )}

        {!loading &&
          !loadError &&
          days.map((day) => (
            <div key={day.date} className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                {day.label}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {day.runs.map((run) => {
                  const detail = describeRun(run);
                  const pill = stateLabel(run.state);
                  return (
                    <li
                      key={`${run.reminderId}-${run.date}-${run.time}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2"
                    >
                      {/* tabular-nums so the times line up as a column rather than jittering with
                          the width of each digit. */}
                      <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                        {run.time}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-text">
                          {run.category
                            ? `${run.category.icon ? `${run.category.icon} ` : ""}${run.category.name}`
                            : "Anything at all"}
                        </span>
                        {detail && (
                          <span className="block truncate text-xs text-text-muted">{detail}</span>
                        )}
                      </span>
                      {pill && (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                            PILL_TONE[run.state as Exclude<UpcomingState, "scheduled">]
                          }`}
                        >
                          {pill}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

        {hidden > 0 && (
          <p className="mt-3 text-xs text-text-muted">
            {/* The count in the header is the real total, so this says what is not on screen
                rather than repeating it. `truncated` means the server capped the list too, so
                the number below is a floor rather than an exact remainder. */}
            …and {hidden} more{data?.truncated ? " (at least)" : ""}.
          </p>
        )}
      </CollapsibleSection>
    </section>
  );
}

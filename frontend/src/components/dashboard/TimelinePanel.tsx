import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { CollapsibleSection } from "../CollapsibleSection";
import { listenForDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";
import { dispatchTimelineAction } from "../../lib/dashboardTimelineActionEvent";
import { dispatchTaskAction } from "../../lib/dashboardTaskActionEvent";
import {
  TIMELINE_RANGES,
  describeRun,
  describeTask,
  groupRunsByDay,
  hasLoggedWithinDays,
  mergeRuns,
  mergeWithTasks,
  orderRuns,
  splitAroundNow,
  stateLabel,
  taskStateLabel,
  timelineRowAction,
  type RecentResponse,
  type TaskResponse,
  type TaskRun,
  type TimelineEntry,
  type TimelineOrder,
  type TimelineRange,
  type TimelineRun,
  type TimelineState,
  type UpcomingResponse,
} from "../../lib/timeline";

// "What did I log, what did I miss, and what's coming up" - one merged, chronological list, at the
// top of the Dashboard because it answers the question people open the app to check. It replaces
// two things that used to sit here separately: the Coming Up panel (docs/log/45) and
// DashboardSummary's own Recent Entries list, which duplicated exactly the "past" half of this once
// GET /api/reminders/recent existed (docs/log/47) - see docs/log/49-timeline-panel.md. This file
// itself also replaces the per-category card list that used to sit further down the page (see
// docs/log/50-timeline-v2.md, which covers the row-click quick action and the order toggle below),
// and now merges in one-off Tasks alongside reminder-driven rows too - see
// docs/log/51-one-off-tasks.md.
//
// Every reminder-driven row comes from one of two server calls. Nothing here expands a cron
// expression or decides whether a reminder fired: the browser has its own cron implementation for
// drawing the picker, and a list built from it would show runs the scheduler never actually sent
// or will never send. A Task carries no such derivation at all - it is what it is, at the moment
// it's due.

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
  runs: TimelineEntry[];
  truncated: boolean;
}

export function TimelinePanel() {
  const [range, setRange] = useState<TimelineRange>(1);
  // Newest first by default - direct feedback that seeing the most recent thing first, rather
  // than scrolling down from a stale "yesterday," is the more useful default reading order. The
  // toggle below switches back to the original oldest-first (past → NOW → future) order.
  const [order, setOrder] = useState<TimelineOrder>("newest");
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Which of the wider range chips are worth offering at all - see hasLoggedWithinDays's own
  // comment. "Today" is never gated by this (see the render below), so only 3 and 7 need an entry
  // here; absent (rather than false) while the one-off probe below hasn't resolved yet, so a chip
  // that will end up available doesn't flash into existence after the panel has already painted.
  const [availableRanges, setAvailableRanges] = useState<Partial<Record<TimelineRange, boolean>>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    // A single days=7 fetch is a superset of every narrower window, so one request answers "is
    // there logged data in the last 3 days" and "...7 days" both - re-run whenever any Dashboard
    // section reports a save (docs/log/dashboardEntryChangedEvent.ts), since backdating or
    // deleting an entry can change which chips are worth showing without a full reload.
    function probe() {
      apiFetch<RecentResponse>("/api/reminders/recent?days=7")
        .then((res) => {
          if (cancelled) return;
          setAvailableRanges({
            3: hasLoggedWithinDays(res.runs, res.today, 3),
            7: hasLoggedWithinDays(res.runs, res.today, 7),
          });
        })
        .catch(() => {
          // A failed probe just means the wider chips stay hidden until the next successful one -
          // this is a soft enhancement, not core functionality, and the main fetch below has its
          // own independent error handling for the data that actually matters.
        });
    }
    probe();
    const unsubscribe = listenForDashboardEntryChanged(probe);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    function load() {
      setLoading(true);
      // All three use the same `days` value - see TIMELINE_RANGES's own comment on why that is a
      // deliberate simplification rather than a literal "N days total" window; GET /api/tasks
      // reads it the identical way (see routes/tasks.ts's own comment).
      Promise.all([
        apiFetch<RecentResponse>(`/api/reminders/recent?days=${range}`),
        apiFetch<UpcomingResponse>(`/api/reminders/upcoming?days=${range}`),
        apiFetch<TaskResponse>(`/api/tasks?days=${range}`),
      ])
        .then(([recent, upcoming, taskResponse]) => {
          if (cancelled) return;
          const tasks: TaskRun[] = taskResponse.tasks.map((task) => ({ ...task, kind: "task" }));
          setData({
            // recent.today and upcoming.today should always agree (same account, same instant,
            // give or take the gap between two requests) - upcoming's is used simply because it
            // is the side nearer "now", for the rare case a request lands exactly on a midnight
            // rollover between the two.
            today: upcoming.today,
            runs: mergeWithTasks(mergeRuns(recent.runs, upcoming.runs), tasks),
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
    }

    load();
    // Refetches immediately once something actually changes - a Timeline row logging a category
    // entry, or TaskManager saving/completing/deleting a task, both dispatch this same event (see
    // dashboardEntryChangedEvent.ts). Missing before Tasks existed: the range-chip probe above
    // already listened for it, but this, the data the panel actually renders, did not - a real
    // gap this task closes rather than one Tasks specifically needed and reminders didn't.
    const unsubscribe = listenForDashboardEntryChanged(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [range]);

  const ordered = data ? orderRuns(data.runs, order) : [];
  const shown = ordered.slice(0, VISIBLE_RUNS);
  const hidden = ordered.length - shown.length;
  const days = data ? groupRunsByDay(shown, data.today) : [];
  const rangeLabel =
    TIMELINE_RANGES.find((r) => r.days === range)?.label.toLowerCase() ?? "this period";
  // "Today" is always offered - it's the default view, and never depends on the probe above. 3
  // and 7 days only join it once there's actually a logged entry that far back (see
  // hasLoggedWithinDays's own comment) - undefined (probe not yet resolved) reads as "not yet",
  // the same as false, so a chip never flashes in only to disappear once the real answer arrives.
  const visibleRangeOptions = TIMELINE_RANGES.filter(
    (option) => option.days === 1 || availableRanges[option.days],
  );

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
        // A sibling of the toggle, not a child of it (see CollapsibleSection's own comment on
        // why that distinction exists) - the most direct way to add a task, right where they're
        // actually going to show up. QuickAddFab offers the same choice from anywhere on
        // Dashboard; this is the one specific to Timeline itself.
        actions={
          <button
            type="button"
            onClick={() => dispatchTaskAction({ type: "add" })}
            aria-label="Add a task"
            title="Add a task"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-brand hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div role="group" aria-label="How far to look" className="flex flex-wrap gap-2">
            {visibleRangeOptions.map((option) => (
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

          <button
            type="button"
            onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}
            title={order === "newest" ? "Switch to oldest first" : "Switch to newest first"}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-text-muted hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
              <path d="M5 4v12M5 16l-3-3M5 16l3-3M15 16V4M15 4l-3 3M15 4l3 3" />
            </svg>
            {order === "newest" ? "Newest first" : "Oldest first"}
          </button>
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
            // today; upcoming only ever returns today onward). splitAroundNow reads `when` rather
            // than re-deriving "already happened" from the run's own time, and puts the future
            // half above NOW instead of below it when reading newest-first.
            const isToday = day.date === data?.today;
            const { above, below } = isToday
              ? splitAroundNow(day.runs, order)
              : { above: day.runs, below: [] };

            return (
              <div key={day.date} className="mt-3">
                {/* Same compact rule-plus-pill shape the NOW divider already used, applied to
                    every day heading now rather than just that one - one visual language instead
                    of a bold uppercase label for ordinary days and a different treatment for NOW. */}
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                    {day.label}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {above.map((entry) => (
                    <TimelineEntryRow key={entryKey(entry)} entry={entry} />
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
                  {below.map((entry) => (
                    <TimelineEntryRow key={entryKey(entry)} entry={entry} />
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

// Stable regardless of which day-group or which side of NOW an entry lands in - a reminder row's
// own (reminderId, date, time) triple was already unique before Tasks existed; a task's own id
// already is one on its own.
function entryKey(entry: TimelineEntry): string {
  return entry.kind === "task"
    ? `task-${entry.id}`
    : `${entry.reminderId}-${entry.date}-${entry.time}`;
}

function TimelineEntryRow({ entry }: { entry: TimelineEntry }) {
  return entry.kind === "task" ? <TaskRowItem task={entry} /> : <ReminderRow run={entry} />;
}

function ReminderRow({ run }: { run: TimelineRun }) {
  const detail = describeRun(run);
  const pill = stateLabel(run.state);
  const action = timelineRowAction(run);

  const content = (
    <>
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
      {/* A quiet edit/add glyph, not a second pill - the state pill above already says what
          happened; this only needs to say that tapping the row does something. */}
      {action && (
        <span aria-hidden="true" className="shrink-0 text-sm text-text-muted">
          {action.type === "edit" ? "✎" : "＋"}
        </span>
      )}
    </>
  );

  // Only a row with somewhere to go becomes a real button - see timelineRowAction's own comment
  // for the one case with no action at all (a future slot already silenced by today's log, which
  // has nothing to add and no one exact entry to edit).
  if (!action) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2">
        {content}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => dispatchTimelineAction(action)}
        aria-label={
          action.type === "edit"
            ? `Edit ${run.category?.name ?? "entry"} at ${run.time}`
            : `Log ${run.category?.name ?? "an entry"} for ${run.time}`
        }
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2 text-left transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {content}
      </button>
    </li>
  );
}

const TASK_PILL_TONE: Record<"overdue" | "done", string> = {
  overdue: "border-danger/50 bg-danger/10 text-danger",
  done: "border-success/50 bg-success/10 text-success",
};

// A task's own row shape: a leading checkbox (its own, independent tap target - marks done
// instantly, no form, see dashboardTaskActionEvent.ts's own comment on why this still goes
// through TaskManager rather than PATCHing directly from here) and a "TASK" tag instead of a
// category icon, but otherwise the same time/detail/pill layout every reminder row already uses.
// The checkbox and the row body are siblings, not one nested inside the other - the same
// toggle-plus-actions shape CollapsibleSection's own header already establishes, for the same
// reason: a button inside a button is invalid HTML, and tapping the inner one would fire both.
function TaskRowItem({ task }: { task: TaskRun }) {
  const detail = describeTask(task);
  const pill = taskStateLabel(task.state);
  const done = task.state === "done";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2">
      <button
        type="button"
        onClick={() => dispatchTaskAction({ type: "toggleDone", task })}
        aria-pressed={done}
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          done ? "border-success bg-success text-white" : "border-border text-transparent"
        }`}
      >
        ✓
      </button>
      <button
        type="button"
        onClick={() => dispatchTaskAction({ type: "edit", task })}
        aria-label={`${task.title}, due ${task.time}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="shrink-0 text-sm font-medium tabular-nums text-text">{task.time}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-text">
            <span className="mr-1.5 rounded-full border border-brand px-1.5 py-px text-[10px] font-bold tracking-wide text-brand uppercase">
              Task
            </span>
            {task.title}
          </span>
          {detail && <span className="block truncate text-xs text-text-muted">{detail}</span>}
        </span>
        {pill && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${TASK_PILL_TONE[task.state as "overdue" | "done"]}`}
          >
            {pill}
          </span>
        )}
      </button>
    </li>
  );
}

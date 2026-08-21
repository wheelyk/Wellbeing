import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { HabitCreateForm, type Habit } from "../HabitCreateForm";
import { HabitEntryForm, type HabitLog } from "../HabitEntryForm";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { formatEntryDateTime } from "../../lib/entryDateLabel";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

// A habit log's value is spread across three nullable columns (see backend's habitLogs.ts) -
// this picks whichever one the habit's type says is the meaningful one and renders it, rather
// than every call site re-deriving that mapping.
function formatHabitValue(log: HabitLog, habit: Habit | undefined): string {
  if (!habit) return "—";
  switch (habit.type) {
    case "boolean":
      return log.valueBoolean ? "Done" : "Not done";
    case "numeric":
      return `${log.valueNumeric}`;
    case "duration":
      return `${log.valueDurationMinutes} min`;
  }
}

// Three states rather than a boolean, unlike the mood section's showForm: logging a habit
// needs an extra step mood never does - defining a habit first when the user has none yet. Both
// non-"closed" states render inside the same Modal (see the return statement below) - only
// which form appears inside it changes.
type HabitFormMode = "closed" | "log" | "create-habit";

// Mirrors HistoryPage's own PAGE_SIZE/offset-pagination shape (see backend/src/lib/pagination.ts)
// - a Quick-Add section only ever needs a short, recent slice, not a user's entire history
// rendered on every dashboard load (see the implementation log entry on why this was added).
const PAGE_SIZE = 10;

interface HabitLogPage {
  entries: HabitLog[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function HabitSection() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [habitLoadError, setHabitLoadError] = useState(false);
  const [habitFormMode, setHabitFormMode] = useState<HabitFormMode>("closed");
  // Set only right after HabitCreateForm succeeds, so the log form that follows opens with the
  // habit the user just defined already selected instead of defaulting to habits[0].
  const [habitToPreselect, setHabitToPreselect] = useState<string | null>(null);
  // Reuses the "log" form mode for both create and edit - see MoodSection's identical
  // editingLog state for the full explanation.
  const [editingLog, setEditingLog] = useState<HabitLog | null>(null);
  // Brief post-save confirmation - see MoodSection's identical use of useTimedMessage for the
  // full explanation of why this is the whole success-feedback mechanism here.
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();

  const habitsById = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Habit[]>("/api/habits"),
      apiFetch<HabitLogPage>(`/api/habit-logs?limit=${PAGE_SIZE}&offset=0`),
    ])
      .then(([habitsRes, habitLogPage]) => {
        if (!cancelled) {
          setHabits(habitsRes);
          setHabitLogs(habitLogPage.entries);
          setHasMore(habitLogPage.hasMore);
        }
      })
      .catch(() => {
        if (!cancelled) setHabitLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setHabitsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wrapped in useCallback (deps: habits.length) so the listener effect below can depend on
  // this function itself rather than reaching past it to habits.length directly - without this,
  // the effect would either need an eslint-disable or resubscribe using a stale closure.
  const handleHabitButtonClick = useCallback(() => {
    setEditingLog(null);
    setHabitFormMode(habits.length === 0 ? "create-habit" : "log");
  }, [habits.length]);

  // Lets QuickAddFab open this section's add flow directly - see MoodSection's identical
  // listener, and dashboardQuickAddEvent.ts, for the full explanation. Reuses
  // handleHabitButtonClick as-is, so the FAB gets the same "straight to habit creation if none
  // exist yet" routing the section's own + button already has.
  useEffect(
    () => listenForDashboardQuickAdd("habit", handleHabitButtonClick),
    [handleHabitButtonClick],
  );

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await apiFetch<HabitLogPage>(
        `/api/habit-logs?limit=${PAGE_SIZE}&offset=${habitLogs.length}`,
      );
      setHabitLogs((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setHabitLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Purely local - see MoodSection's identical handleLoadLess for the full explanation of why
  // no network round-trip (or further hasMore check) is needed here.
  function handleLoadLess() {
    setHabitLogs((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  function handleHabitCreated(habit: Habit) {
    setHabits((prev) => [...prev, habit]);
    setHabitToPreselect(habit.id);
    setHabitFormMode("log");
  }

  function handleHabitLogSaved(log: HabitLog) {
    setHabitLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setHabitFormMode("closed");
    setHabitToPreselect(null);
    setEditingLog(null);
    showSavedMessage("Habit entry saved.");
    // Lets DashboardSummary refetch immediately instead of waiting out its poll interval - see
    // dashboardEntryChangedEvent.ts for why a DOM event, not lifted state.
    dispatchDashboardEntryChanged("habit");
  }

  function handleHabitLogEdit(log: HabitLog) {
    setEditingLog(log);
    setHabitFormMode("log");
  }

  function handleHabitLogFormCancel() {
    setHabitFormMode("closed");
    setEditingLog(null);
  }

  async function handleHabitLogDelete(id: string) {
    // Destructive and irreversible - confirm before touching state or the network, same
    // pattern HistoryPage.tsx already uses for its own delete action (per requirements §15).
    const confirmed = window.confirm("Delete this habit entry? This can't be undone.");
    if (!confirmed) return;

    const previous = habitLogs;
    setHabitLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/habit-logs/${id}`, { method: "DELETE" });
      dispatchDashboardEntryChanged("habit");
    } catch {
      setHabitLogs(previous);
    }
  }

  const modalTitle =
    habitFormMode === "create-habit"
      ? habits.length === 0
        ? "Create your first habit"
        : "Create a new habit"
      : editingLog
        ? "Edit habit entry"
        : "Log a habit";

  return (
    <>
      <SectionPanel
        title="Recent habit entries"
        storageKey="habit"
        addLabel="Add habit entry"
        onAddClick={handleHabitButtonClick}
      >
        {savedMessage && (
          <p role="status" className="mb-3 text-sm font-medium text-success">
            {savedMessage}
          </p>
        )}
        {habitsLoading && <p className="text-text-muted">Loading…</p>}
        {habitLoadError && (
          <p role="alert" className="text-danger">
            Couldn&apos;t load your habits. Please try refreshing.
          </p>
        )}
        {!habitsLoading && !habitLoadError && habits.length === 0 && (
          <p className="text-text-muted">
            You haven&apos;t created any habits yet — use the button above to define one (e.g.
            Exercise, Water intake, Sleep) before you can log against it.
          </p>
        )}
        {!habitsLoading && !habitLoadError && habits.length > 0 && habitLogs.length === 0 && (
          <p className="text-text-muted">
            Nothing logged yet — use the button above to record a habit entry.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {habitLogs.map((log) => {
            const habit = habitsById.get(log.habitId);
            return (
              <li
                key={log.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4"
              >
                <div>
                  <p className="text-text">
                    {habit?.name ?? "Unknown habit"}: {formatHabitValue(log, habit)}
                  </p>
                  {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                  <p className="text-xs text-text-muted">{formatEntryDateTime(log.loggedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleHabitLogEdit(log)}
                    aria-label={`Edit habit entry from ${formatEntryDateTime(log.loggedAt)}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleHabitLogDelete(log.id)}
                    aria-label={`Delete habit entry from ${formatEntryDateTime(log.loggedAt)}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {!habitsLoading && !habitLoadError && (hasMore || habitLogs.length > PAGE_SIZE) && (
          <div className="mt-4 flex justify-center gap-2">
            {hasMore && (
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
            {habitLogs.length > PAGE_SIZE && (
              <Button variant="secondary" onClick={handleLoadLess}>
                Load less
              </Button>
            )}
          </div>
        )}
      </SectionPanel>
      <Modal
        open={habitFormMode !== "closed"}
        onClose={handleHabitLogFormCancel}
        title={modalTitle}
      >
        {habitFormMode === "log" && (
          <HabitEntryForm
            key={editingLog?.id ?? habitToPreselect ?? "create"}
            habits={habits}
            initialHabitId={habitToPreselect}
            editingLog={editingLog}
            onSaved={handleHabitLogSaved}
            onCancel={handleHabitLogFormCancel}
            onAddHabit={() => setHabitFormMode("create-habit")}
          />
        )}
        {habitFormMode === "create-habit" && (
          <HabitCreateForm
            onCreated={handleHabitCreated}
            onCancel={() => setHabitFormMode(habits.length === 0 ? "closed" : "log")}
          />
        )}
      </Modal>
    </>
  );
}

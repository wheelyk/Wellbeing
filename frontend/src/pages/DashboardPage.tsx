import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { MoodEntryForm, type MoodLog } from "../components/MoodEntryForm";
import { HabitCreateForm, type Habit } from "../components/HabitCreateForm";
import { HabitEntryForm, type HabitLog } from "../components/HabitEntryForm";
import { apiFetch } from "../api/client";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

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

// Three states rather than a boolean, unlike the mood form's showForm: logging a habit needs an
// extra step the mood form never does - defining a habit first when the user has none yet (see
// IMPLEMENTATION_LOG.md for the full "create a habit first" flow this state machine drives).
type HabitFormMode = "closed" | "log" | "create-habit";

export function DashboardPage() {
  const { user } = useAuth();
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitLoadError, setHabitLoadError] = useState(false);
  const [habitFormMode, setHabitFormMode] = useState<HabitFormMode>("closed");
  // Set only right after HabitCreateForm succeeds, so the log form that follows opens with the
  // habit the user just defined already selected instead of defaulting to habits[0].
  const [habitToPreselect, setHabitToPreselect] = useState<string | null>(null);

  const habitsById = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MoodLog[]>("/api/mood-logs")
      .then((logs) => {
        if (!cancelled) setMoodLogs(logs);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<Habit[]>("/api/habits"), apiFetch<HabitLog[]>("/api/habit-logs")])
      .then(([habitsRes, habitLogsRes]) => {
        if (!cancelled) {
          setHabits(habitsRes);
          setHabitLogs(habitLogsRes);
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

  function handleSaved(log: MoodLog) {
    setMoodLogs((prev) => [log, ...prev]);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const previous = moodLogs;
    setMoodLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/mood-logs/${id}`, { method: "DELETE" });
    } catch {
      setMoodLogs(previous);
    }
  }

  function handleHabitButtonClick() {
    setHabitFormMode(habits.length === 0 ? "create-habit" : "log");
  }

  function handleHabitCreated(habit: Habit) {
    setHabits((prev) => [...prev, habit]);
    setHabitToPreselect(habit.id);
    setHabitFormMode("log");
  }

  function handleHabitLogSaved(log: HabitLog) {
    setHabitLogs((prev) => [log, ...prev]);
    setHabitFormMode("closed");
    setHabitToPreselect(null);
  }

  async function handleHabitLogDelete(id: string) {
    const previous = habitLogs;
    setHabitLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/habit-logs/${id}`, { method: "DELETE" });
    } catch {
      setHabitLogs(previous);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">
          You&apos;re logged in as {user?.email}. The full dashboard (today&apos;s summary, streak,
          all four log types) is built in a later phase — this is the first real feature: mood
          logging.
        </p>

        <section className="mt-6">
          {showForm ? (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-text">Log your mood</h2>
              <MoodEntryForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)}>+ Mood</Button>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-text">Recent mood entries</h2>
          {loading && <p className="text-text-muted">Loading…</p>}
          {loadError && (
            <p role="alert" className="text-danger">
              Couldn&apos;t load your mood entries. Please try refreshing.
            </p>
          )}
          {!loading && !loadError && moodLogs.length === 0 && (
            <p className="text-text-muted">
              Nothing logged yet — use the button above to record how you&apos;re feeling.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {moodLogs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {MOOD_EMOJI[log.mood]}
                  </span>
                  <div>
                    <p className="text-text">
                      Mood {log.mood}/5
                      {log.energy !== null && ` · Energy ${log.energy}/7`}
                      {log.stress !== null && ` · Stress ${log.stress}/7`}
                    </p>
                    {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                    <p className="text-xs text-text-muted">
                      {new Date(log.loggedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleDelete(log.id)}
                  aria-label={`Delete mood entry from ${new Date(log.loggedAt).toLocaleString()}`}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          {habitFormMode === "log" && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-text">Log a habit</h2>
              <HabitEntryForm
                habits={habits}
                initialHabitId={habitToPreselect}
                onSaved={handleHabitLogSaved}
                onCancel={() => setHabitFormMode("closed")}
                onAddHabit={() => setHabitFormMode("create-habit")}
              />
            </div>
          )}
          {habitFormMode === "create-habit" && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-text">
                {habits.length === 0 ? "Create your first habit" : "Create a new habit"}
              </h2>
              <HabitCreateForm
                onCreated={handleHabitCreated}
                onCancel={() => setHabitFormMode(habits.length === 0 ? "closed" : "log")}
              />
            </div>
          )}
          {habitFormMode === "closed" && <Button onClick={handleHabitButtonClick}>+ Habit</Button>}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-text">Recent habit entries</h2>
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
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
                >
                  <div>
                    <p className="text-text">
                      {habit?.name ?? "Unknown habit"}: {formatHabitValue(log, habit)}
                    </p>
                    {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                    <p className="text-xs text-text-muted">
                      {new Date(log.loggedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => handleHabitLogDelete(log.id)}
                    aria-label={`Delete habit entry from ${new Date(log.loggedAt).toLocaleString()}`}
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

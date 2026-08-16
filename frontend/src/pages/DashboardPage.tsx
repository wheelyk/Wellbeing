import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { MoodEntryForm, type MoodLog } from "../components/MoodEntryForm";
import { apiFetch } from "../api/client";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

export function DashboardPage() {
  const { user } = useAuth();
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
      </main>
    </div>
  );
}

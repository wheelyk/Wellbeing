import { useEffect, useState } from "react";
import { Button } from "../Button";
import { MoodEntryForm, type MoodLog } from "../MoodEntryForm";
import { apiFetch } from "../../api/client";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

// Self-contained: owns its own fetch, form-visibility, and save/delete handling, so adding
// another log type to the Dashboard means adding a new file like this one plus one line in
// DashboardPage.tsx, rather than editing this component's state/effects/handlers directly -
// see the implementation log entry on decomposing the Dashboard for why this shape was chosen.
export function MoodSection() {
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Reuses the same showForm area both create and edit render into - null means "creating a
  // new entry", a log means "editing that entry" (see MoodEntryForm's editingLog prop).
  const [editingLog, setEditingLog] = useState<MoodLog | null>(null);

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
    setMoodLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setShowForm(false);
    setEditingLog(null);
  }

  function handleEdit(log: MoodLog) {
    setEditingLog(log);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingLog(null);
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
    <>
      <section className="mt-6">
        {showForm ? (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-text">
              {editingLog ? "Edit mood entry" : "Log your mood"}
            </h2>
            <MoodEntryForm
              key={editingLog?.id ?? "create"}
              editingLog={editingLog}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </div>
        ) : (
          <Button
            onClick={() => {
              setEditingLog(null);
              setShowForm(true);
            }}
          >
            + Mood
          </Button>
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
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleEdit(log)}
                  aria-label={`Edit mood entry from ${new Date(log.loggedAt).toLocaleString()}`}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDelete(log.id)}
                  aria-label={`Delete mood entry from ${new Date(log.loggedAt).toLocaleString()}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

import { useEffect, useState } from "react";
import { Button } from "../Button";
import { MoodEntryForm, type MoodLog } from "../MoodEntryForm";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { formatEntryDateTime } from "../../lib/entryDateLabel";
import { useTimedMessage } from "../../hooks/useTimedMessage";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

// Mirrors HistoryPage's own PAGE_SIZE/offset-pagination shape (see backend/src/lib/pagination.ts)
// - a Quick-Add section only ever needs a short, recent slice, not a user's entire history
// rendered on every dashboard load (see the implementation log entry on why this was added).
const PAGE_SIZE = 10;

interface MoodLogPage {
  entries: MoodLog[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Self-contained: owns its own fetch, form-visibility, and save/delete handling, so adding
// another log type to the Dashboard means adding a new file like this one plus one line in
// DashboardPage.tsx, rather than editing this component's state/effects/handlers directly -
// see the implementation log entry on decomposing the Dashboard for why this shape was chosen.
export function MoodSection() {
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Reuses the same showForm area both create and edit render into - null means "creating a
  // new entry", a log means "editing that entry" (see MoodEntryForm's editingLog prop).
  const [editingLog, setEditingLog] = useState<MoodLog | null>(null);
  // Brief post-save confirmation ("Mood entry saved.") shown once the form closes - there's no
  // toast system in this app, so this is the entire success-feedback mechanism (see
  // useTimedMessage for why it clears itself rather than needing manual dismissal).
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();

  useEffect(() => {
    let cancelled = false;
    apiFetch<MoodLogPage>(`/api/mood-logs?limit=${PAGE_SIZE}&offset=0`)
      .then((page) => {
        if (!cancelled) {
          setMoodLogs(page.entries);
          setHasMore(page.hasMore);
        }
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

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await apiFetch<MoodLogPage>(
        `/api/mood-logs?limit=${PAGE_SIZE}&offset=${moodLogs.length}`,
      );
      setMoodLogs((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSaved(log: MoodLog) {
    setMoodLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setShowForm(false);
    setEditingLog(null);
    showSavedMessage("Mood entry saved.");
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
    // Destructive and irreversible - confirm before touching state or the network, same
    // pattern HistoryPage.tsx already uses for its own delete action (per requirements §15).
    const confirmed = window.confirm("Delete this mood entry? This can't be undone.");
    if (!confirmed) return;

    const previous = moodLogs;
    setMoodLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/mood-logs/${id}`, { method: "DELETE" });
    } catch {
      setMoodLogs(previous);
    }
  }

  return (
    <SectionPanel
      title="Recent mood entries"
      storageKey="mood"
      addLabel="Add mood entry"
      onAddClick={() => {
        setEditingLog(null);
        setShowForm(true);
      }}
    >
      {showForm && (
        <div className="mb-4">
          <h3 className="mb-4 text-base font-semibold text-text">
            {editingLog ? "Edit mood entry" : "Log your mood"}
          </h3>
          <MoodEntryForm
            key={editingLog?.id ?? "create"}
            editingLog={editingLog}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      )}
      {savedMessage && (
        <p role="status" className="mb-3 text-sm font-medium text-success">
          {savedMessage}
        </p>
      )}
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
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4"
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
                <p className="text-xs text-text-muted">{formatEntryDateTime(log.loggedAt)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => handleEdit(log)}
                aria-label={`Edit mood entry from ${formatEntryDateTime(log.loggedAt)}`}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDelete(log.id)}
                aria-label={`Delete mood entry from ${formatEntryDateTime(log.loggedAt)}`}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && !loadError && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </SectionPanel>
  );
}

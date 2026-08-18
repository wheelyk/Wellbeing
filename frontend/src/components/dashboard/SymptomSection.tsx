import { useEffect, useState } from "react";
import { Button } from "../Button";
import { SymptomEntryForm, type Symptom, type SymptomLog } from "../SymptomEntryForm";
import { apiFetch } from "../../api/client";

// Mirrors HistoryPage's own PAGE_SIZE/offset-pagination shape (see backend/src/lib/pagination.ts)
// - a Quick-Add section only ever needs a short, recent slice, not a user's entire history
// rendered on every dashboard load (see the implementation log entry on why this was added).
const PAGE_SIZE = 10;

interface SymptomLogPage {
  entries: SymptomLog[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function SymptomSection() {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showSymptomForm, setShowSymptomForm] = useState(false);
  const [symptomLoadError, setSymptomLoadError] = useState(false);
  // Reuses the same showSymptomForm area both create and edit render into - see MoodSection's
  // identical editingLog state for the full explanation.
  const [editingLog, setEditingLog] = useState<SymptomLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Fetched together: the symptom picker inside SymptomEntryForm and the recent-entries
    // list below both need the full symptom list (to resolve a log's symptomId to a display
    // name), so one Promise.all keeps them from racing independently or briefly disagreeing.
    Promise.all([
      apiFetch<Symptom[]>("/api/symptoms"),
      apiFetch<SymptomLogPage>(`/api/symptom-logs?limit=${PAGE_SIZE}&offset=0`),
    ])
      .then(([symptomsRes, symptomLogPage]) => {
        if (!cancelled) {
          setSymptoms(symptomsRes);
          setSymptomLogs(symptomLogPage.entries);
          setHasMore(symptomLogPage.hasMore);
        }
      })
      .catch(() => {
        if (!cancelled) setSymptomLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setSymptomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await apiFetch<SymptomLogPage>(
        `/api/symptom-logs?limit=${PAGE_SIZE}&offset=${symptomLogs.length}`,
      );
      setSymptomLogs((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setSymptomLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSymptomSaved(log: SymptomLog) {
    setSymptomLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setShowSymptomForm(false);
    setEditingLog(null);
  }

  function handleSymptomCreated(symptom: Symptom) {
    setSymptoms((prev) => (prev.some((s) => s.id === symptom.id) ? prev : [...prev, symptom]));
  }

  function handleSymptomEdit(log: SymptomLog) {
    setEditingLog(log);
    setShowSymptomForm(true);
  }

  function handleSymptomFormCancel() {
    setShowSymptomForm(false);
    setEditingLog(null);
  }

  async function handleSymptomDelete(id: string) {
    const previous = symptomLogs;
    setSymptomLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/symptom-logs/${id}`, { method: "DELETE" });
    } catch {
      setSymptomLogs(previous);
    }
  }

  function symptomName(symptomId: string): string {
    return symptoms.find((s) => s.id === symptomId)?.name ?? "Unknown symptom";
  }

  return (
    <>
      <section className="mt-8">
        {showSymptomForm ? (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-text">
              {editingLog ? "Edit symptom entry" : "Log a symptom"}
            </h2>
            <SymptomEntryForm
              key={editingLog?.id ?? "create"}
              symptoms={symptoms}
              editingLog={editingLog}
              onSaved={handleSymptomSaved}
              onCancel={handleSymptomFormCancel}
              onSymptomCreated={handleSymptomCreated}
            />
          </div>
        ) : (
          <Button
            onClick={() => {
              setEditingLog(null);
              setShowSymptomForm(true);
            }}
          >
            + Symptom
          </Button>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-text">Recent symptom entries</h2>
        {symptomsLoading && <p className="text-text-muted">Loading…</p>}
        {symptomLoadError && (
          <p role="alert" className="text-danger">
            Couldn&apos;t load your symptom entries. Please try refreshing.
          </p>
        )}
        {!symptomsLoading && !symptomLoadError && symptomLogs.length === 0 && (
          <p className="text-text-muted">
            Nothing logged yet — use the button above to record a symptom.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {symptomLogs.map((log) => (
            <li
              key={log.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div>
                <p className="text-text">
                  {symptomName(log.symptomId)} · Severity {log.severity}/10
                </p>
                {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                <p className="text-xs text-text-muted">{new Date(log.loggedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleSymptomEdit(log)}
                  aria-label={`Edit symptom entry from ${new Date(log.loggedAt).toLocaleString()}`}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSymptomDelete(log.id)}
                  aria-label={`Delete symptom entry from ${new Date(log.loggedAt).toLocaleString()}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!symptomsLoading && !symptomLoadError && hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

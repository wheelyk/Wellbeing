import { useEffect, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { SymptomEntryForm, type Symptom, type SymptomLog } from "../SymptomEntryForm";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { formatEntryDateTime } from "../../lib/entryDateLabel";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

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
  // Brief post-save confirmation - see MoodSection's identical use of useTimedMessage for the
  // full explanation of why this is the whole success-feedback mechanism here.
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();

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

  // Lets QuickAddFab open this section's add form directly - see MoodSection's identical
  // listener, and dashboardQuickAddEvent.ts, for the full explanation.
  useEffect(
    () =>
      listenForDashboardQuickAdd("symptom", () => {
        setEditingLog(null);
        setShowSymptomForm(true);
      }),
    [],
  );

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

  // Purely local - see MoodSection's identical handleLoadLess for the full explanation of why
  // no network round-trip (or further hasMore check) is needed here.
  function handleLoadLess() {
    setSymptomLogs((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  function handleSymptomSaved(log: SymptomLog) {
    setSymptomLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setShowSymptomForm(false);
    setEditingLog(null);
    showSavedMessage("Symptom entry saved.");
    // Lets DashboardSummary refetch immediately instead of waiting out its poll interval - see
    // dashboardEntryChangedEvent.ts for why a DOM event, not lifted state.
    dispatchDashboardEntryChanged("symptom");
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
    // Destructive and irreversible - confirm before touching state or the network, same
    // pattern HistoryPage.tsx already uses for its own delete action (per requirements §15).
    const confirmed = window.confirm("Delete this symptom entry? This can't be undone.");
    if (!confirmed) return;

    const previous = symptomLogs;
    setSymptomLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/symptom-logs/${id}`, { method: "DELETE" });
      dispatchDashboardEntryChanged("symptom");
    } catch {
      setSymptomLogs(previous);
    }
  }

  function symptomName(symptomId: string): string {
    return symptoms.find((s) => s.id === symptomId)?.name ?? "Unknown symptom";
  }

  return (
    <>
      <SectionPanel
        title="Recent symptom entries"
        storageKey="symptom"
        addLabel="Add symptom entry"
        onAddClick={() => {
          setEditingLog(null);
          setShowSymptomForm(true);
        }}
      >
        {savedMessage && (
          <p role="status" className="mb-3 text-sm font-medium text-success">
            {savedMessage}
          </p>
        )}
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
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4"
            >
              <div>
                <p className="text-text">
                  {symptomName(log.symptomId)} · Severity {log.severity}/10
                </p>
                {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                <p className="text-xs text-text-muted">{formatEntryDateTime(log.loggedAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleSymptomEdit(log)}
                  aria-label={`Edit symptom entry from ${formatEntryDateTime(log.loggedAt)}`}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSymptomDelete(log.id)}
                  aria-label={`Delete symptom entry from ${formatEntryDateTime(log.loggedAt)}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!symptomsLoading && !symptomLoadError && (hasMore || symptomLogs.length > PAGE_SIZE) && (
          <div className="mt-4 flex justify-center gap-2">
            {hasMore && (
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
            {symptomLogs.length > PAGE_SIZE && (
              <Button variant="secondary" onClick={handleLoadLess}>
                Load less
              </Button>
            )}
          </div>
        )}
      </SectionPanel>
      <Modal
        open={showSymptomForm}
        onClose={handleSymptomFormCancel}
        title={editingLog ? "Edit symptom entry" : "Log a symptom"}
      >
        <SymptomEntryForm
          key={editingLog?.id ?? "create"}
          symptoms={symptoms}
          editingLog={editingLog}
          onSaved={handleSymptomSaved}
          onCancel={handleSymptomFormCancel}
          onSymptomCreated={handleSymptomCreated}
        />
      </Modal>
    </>
  );
}

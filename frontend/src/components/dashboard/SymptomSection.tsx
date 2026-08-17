import { useEffect, useState } from "react";
import { Button } from "../Button";
import { SymptomEntryForm, type Symptom, type SymptomLog } from "../SymptomEntryForm";
import { apiFetch } from "../../api/client";

export function SymptomSection() {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [showSymptomForm, setShowSymptomForm] = useState(false);
  const [symptomLoadError, setSymptomLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Fetched together: the symptom picker inside SymptomEntryForm and the recent-entries
    // list below both need the full symptom list (to resolve a log's symptomId to a display
    // name), so one Promise.all keeps them from racing independently or briefly disagreeing.
    Promise.all([apiFetch<Symptom[]>("/api/symptoms"), apiFetch<SymptomLog[]>("/api/symptom-logs")])
      .then(([symptomsRes, symptomLogsRes]) => {
        if (!cancelled) {
          setSymptoms(symptomsRes);
          setSymptomLogs(symptomLogsRes);
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

  function handleSymptomSaved(log: SymptomLog) {
    setSymptomLogs((prev) => [log, ...prev]);
    setShowSymptomForm(false);
  }

  function handleSymptomCreated(symptom: Symptom) {
    setSymptoms((prev) => (prev.some((s) => s.id === symptom.id) ? prev : [...prev, symptom]));
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
            <h2 className="mb-4 text-lg font-semibold text-text">Log a symptom</h2>
            <SymptomEntryForm
              symptoms={symptoms}
              onSaved={handleSymptomSaved}
              onCancel={() => setShowSymptomForm(false)}
              onSymptomCreated={handleSymptomCreated}
            />
          </div>
        ) : (
          <Button onClick={() => setShowSymptomForm(true)}>+ Symptom</Button>
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
              <Button
                variant="secondary"
                onClick={() => handleSymptomDelete(log.id)}
                aria-label={`Delete symptom entry from ${new Date(log.loggedAt).toLocaleString()}`}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

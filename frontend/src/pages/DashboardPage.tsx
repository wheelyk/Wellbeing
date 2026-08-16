import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { MoodEntryForm, type MoodLog } from "../components/MoodEntryForm";
import { SymptomEntryForm, type Symptom, type SymptomLog } from "../components/SymptomEntryForm";
import { apiFetch } from "../api/client";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

export function DashboardPage() {
  const { user } = useAuth();
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [showSymptomForm, setShowSymptomForm] = useState(false);
  const [symptomLoadError, setSymptomLoadError] = useState(false);

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

  function handleSymptomSaved(log: SymptomLog) {
    setSymptomLogs((prev) => [log, ...prev]);
    setShowSymptomForm(false);
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
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">
          You&apos;re logged in as {user?.email}. The full dashboard (today&apos;s summary, streak,
          all four log types) is built in a later phase — mood and symptom logging are the first two
          real features built so far.
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
          {showSymptomForm ? (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-text">Log a symptom</h2>
              <SymptomEntryForm
                symptoms={symptoms}
                onSaved={handleSymptomSaved}
                onCancel={() => setShowSymptomForm(false)}
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
                  <p className="text-xs text-text-muted">
                    {new Date(log.loggedAt).toLocaleString()}
                  </p>
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
      </main>
    </div>
  );
}

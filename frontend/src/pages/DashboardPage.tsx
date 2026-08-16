import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { MoodEntryForm, type MoodLog } from "../components/MoodEntryForm";
import {
  MedicationEntryForm,
  type Medication,
  type MedicationLog,
} from "../components/MedicationEntryForm";
import { apiFetch } from "../api/client";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

export function DashboardPage() {
  const { user } = useAuth();
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [medicationLoading, setMedicationLoading] = useState(true);
  const [medicationLoadError, setMedicationLoadError] = useState(false);
  const [showMedicationForm, setShowMedicationForm] = useState(false);

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
    // Fetched together because the log list needs each medication's name to display
    // (MedicationLog only stores medicationId), and both are needed before the list can
    // render meaningfully.
    Promise.all([
      apiFetch<Medication[]>("/api/medications"),
      apiFetch<MedicationLog[]>("/api/medication-logs"),
    ])
      .then(([meds, logs]) => {
        if (cancelled) return;
        setMedications(meds);
        setMedicationLogs(logs);
      })
      .catch(() => {
        if (!cancelled) setMedicationLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setMedicationLoading(false);
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

  function handleMedicationSaved(log: MedicationLog, medication: Medication) {
    setMedicationLogs((prev) => [log, ...prev]);
    // The medication may have just been created inline within the form (a user with no
    // medications yet adding their first one) - fold it into local state instead of
    // re-fetching, so the log list can immediately show its name.
    setMedications((prev) =>
      prev.some((m) => m.id === medication.id) ? prev : [...prev, medication],
    );
    setShowMedicationForm(false);
  }

  async function handleDeleteMedicationLog(id: string) {
    const previous = medicationLogs;
    setMedicationLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/medication-logs/${id}`, { method: "DELETE" });
    } catch {
      setMedicationLogs(previous);
    }
  }

  const medicationNameById = new Map(
    medications.map((medication) => [medication.id, medication.name]),
  );

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">
          You&apos;re logged in as {user?.email}. The full dashboard (today&apos;s summary, streak,
          all four log types) is built in a later phase — so far mood and medication logging are
          wired up.
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
          {showMedicationForm ? (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-text">Log a medication</h2>
              <MedicationEntryForm
                onSaved={handleMedicationSaved}
                onCancel={() => setShowMedicationForm(false)}
              />
            </div>
          ) : (
            <Button onClick={() => setShowMedicationForm(true)}>+ Medication</Button>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-text">Recent medications</h2>
          {medicationLoading && <p className="text-text-muted">Loading…</p>}
          {medicationLoadError && (
            <p role="alert" className="text-danger">
              Couldn&apos;t load your medications. Please try refreshing.
            </p>
          )}
          {!medicationLoading && !medicationLoadError && medicationLogs.length === 0 && (
            <p className="text-text-muted">
              Nothing logged yet — use the button above to record a medication.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {medicationLogs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {log.taken ? "✅" : "❌"}
                  </span>
                  <div>
                    <p className="text-text">
                      {medicationNameById.get(log.medicationId) ?? "Medication"} —{" "}
                      {log.taken ? "Taken" : "Not taken"}
                    </p>
                    {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                    <p className="text-xs text-text-muted">
                      {new Date(log.loggedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleDeleteMedicationLog(log.id)}
                  aria-label={`Delete medication entry from ${new Date(log.loggedAt).toLocaleString()}`}
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

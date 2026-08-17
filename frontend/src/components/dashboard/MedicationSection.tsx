import { useEffect, useState } from "react";
import { Button } from "../Button";
import { MedicationEntryForm, type Medication, type MedicationLog } from "../MedicationEntryForm";
import { apiFetch } from "../../api/client";

export function MedicationSection() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [medicationLoading, setMedicationLoading] = useState(true);
  const [medicationLoadError, setMedicationLoadError] = useState(false);
  const [showMedicationForm, setShowMedicationForm] = useState(false);

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
    <>
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
    </>
  );
}

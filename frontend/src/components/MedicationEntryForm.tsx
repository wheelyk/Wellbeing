import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./Button";
import { TextField } from "./TextField";

export interface Medication {
  id: string;
  userId: string;
  name: string;
  dosage: string | null;
  createdAt: string;
}

export interface MedicationLog {
  id: string;
  userId: string;
  medicationId: string;
  taken: boolean;
  notes: string | null;
  loggedAt: string;
}

// Formats a Date as the value a <input type="datetime-local"> expects (local time,
// "YYYY-MM-DDTHH:mm") - the input has no concept of timezones, it just shows/edits whatever
// local wall-clock time the browser is set to. Same helper as MoodEntryForm's; kept local
// rather than shared since neither component has a broader "utils" module to live in yet.
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface MedicationEntryFormProps {
  // Passes back both the created log and the medication it belongs to, so the caller (the
  // Dashboard) can show the right medication name immediately even when the log was just
  // created against a medication the user added inline, moments ago, in this same form -
  // without needing a second round-trip to re-fetch the medication list.
  onSaved: (log: MedicationLog, medication: Medication) => void;
  onCancel: () => void;
}

export function MedicationEntryForm({ onSaved, onCancel }: MedicationEntryFormProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medsLoading, setMedsLoading] = useState(true);
  const [medsLoadError, setMedsLoadError] = useState(false);

  const [selectedMedicationId, setSelectedMedicationId] = useState<string | null>(null);
  const [medicationError, setMedicationError] = useState<string | null>(null);

  const [showAddMedication, setShowAddMedication] = useState(false);
  const [newMedicationName, setNewMedicationName] = useState("");
  const [newMedicationDosage, setNewMedicationDosage] = useState("");
  const [addingMedication, setAddingMedication] = useState(false);
  const [addMedicationError, setAddMedicationError] = useState<string | null>(null);

  const [taken, setTaken] = useState<boolean | null>(null);
  const [takenError, setTakenError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Medication[]>("/api/medications")
      .then((meds) => {
        if (cancelled) return;
        setMedications(meds);
        // No medications yet - go straight to the "add one" affordance rather than showing an
        // empty picker with nothing to select, since there's nothing useful to tap otherwise.
        setShowAddMedication(meds.length === 0);
      })
      .catch(() => {
        if (!cancelled) setMedsLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setMedsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddMedication() {
    const name = newMedicationName.trim();
    if (!name) {
      setAddMedicationError("Enter a medication name.");
      return;
    }
    setAddMedicationError(null);
    setAddingMedication(true);
    try {
      const dosage = newMedicationDosage.trim();
      const medication = await apiFetch<Medication>("/api/medications", {
        method: "POST",
        body: JSON.stringify({ name, dosage: dosage || undefined }),
      });
      setMedications((prev) => [...prev, medication]);
      setSelectedMedicationId(medication.id);
      setMedicationError(null);
      setNewMedicationName("");
      setNewMedicationDosage("");
      setShowAddMedication(false);
    } catch {
      setAddMedicationError("Couldn't add that medication. Please try again.");
    } finally {
      setAddingMedication(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let hasError = false;
    if (!selectedMedicationId) {
      setMedicationError("Choose which medication this is for.");
      hasError = true;
    } else {
      setMedicationError(null);
    }
    if (taken === null) {
      setTakenError("Choose whether it was taken.");
      hasError = true;
    } else {
      setTakenError(null);
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      const log = await apiFetch<MedicationLog>("/api/medication-logs", {
        method: "POST",
        body: JSON.stringify({
          medicationId: selectedMedicationId,
          taken,
          notes: notes.trim() || undefined,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      const medication = medications.find((m) => m.id === selectedMedicationId);
      if (medication) {
        onSaved(log, medication);
      }
    } catch {
      setFormError("Something went wrong saving your medication entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-text">Which medication?</legend>

        {medsLoading && <p className="mt-2 text-text-muted">Loading your medications…</p>}
        {medsLoadError && (
          <p role="alert" className="mt-2 text-danger">
            Couldn&apos;t load your medications. Please try refreshing.
          </p>
        )}

        {!medsLoading && !medsLoadError && medications.length > 0 && (
          <div
            className="mt-2 flex flex-col gap-2"
            role="radiogroup"
            aria-label="Which medication?"
          >
            {medications.map((medication) => (
              <button
                key={medication.id}
                type="button"
                role="radio"
                aria-checked={selectedMedicationId === medication.id}
                onClick={() => {
                  setSelectedMedicationId(medication.id);
                  setMedicationError(null);
                }}
                className={`rounded-lg border-2 px-4 py-3 text-left text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  selectedMedicationId === medication.id
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-text"
                }`}
              >
                {medication.name}
                {medication.dosage && (
                  <span className="ml-2 font-normal text-text-muted">— {medication.dosage}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {medicationError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {medicationError}
          </p>
        )}

        {!medsLoading && !showAddMedication && (
          <button
            type="button"
            onClick={() => setShowAddMedication(true)}
            className="mt-2 text-sm font-medium text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            + Add another medication
          </button>
        )}

        {!medsLoading && showAddMedication && (
          <div className="mt-3 flex flex-col gap-2">
            <TextField
              label={medications.length === 0 ? "Medication name" : "New medication name"}
              value={newMedicationName}
              onChange={(e) => setNewMedicationName(e.target.value)}
              error={addMedicationError ?? undefined}
              placeholder="e.g. Diazepam"
            />
            <TextField
              label="Dosage (optional)"
              value={newMedicationDosage}
              onChange={(e) => setNewMedicationDosage(e.target.value)}
              placeholder="e.g. 2mg"
            />
            <Button
              type="button"
              onClick={handleAddMedication}
              disabled={addingMedication}
              className="self-start"
            >
              {addingMedication ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-text">Was it taken?</legend>
        <div className="mt-2 flex gap-3" role="radiogroup" aria-label="Was it taken?">
          <button
            type="button"
            role="radio"
            aria-checked={taken === true}
            onClick={() => {
              setTaken(true);
              setTakenError(null);
            }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg border-2 py-4 text-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              taken === true ? "border-brand bg-brand/10" : "border-border"
            }`}
          >
            <span aria-hidden="true">✅</span>
            <span className="text-sm font-medium text-text-muted">Taken</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={taken === false}
            onClick={() => {
              setTaken(false);
              setTakenError(null);
            }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg border-2 py-4 text-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              taken === false ? "border-brand bg-brand/10" : "border-border"
            }`}
          >
            <span aria-hidden="true">❌</span>
            <span className="text-sm font-medium text-text-muted">Not taken</span>
          </button>
        </div>
        {takenError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {takenError}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="medication-notes" className="text-sm font-medium text-text">
          Notes (optional)
        </label>
        <textarea
          id="medication-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="medication-logged-at" className="text-sm font-medium text-text">
          Date &amp; time
        </label>
        <input
          id="medication-logged-at"
          type="datetime-local"
          value={loggedAt}
          onChange={(e) => setLoggedAt(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save Entry"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

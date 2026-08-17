import { useId, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./Button";
import { TextField } from "./TextField";

export interface Symptom {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface SymptomLog {
  id: string;
  userId: string;
  symptomId: string;
  severity: number;
  notes: string | null;
  loggedAt: string;
}

// 1-10 rather than mood's 1-5 or energy/stress's 1-7, per requirements - a wider scale for
// symptom severity, matching the wireframe's "large 1-10 severity control."
const SEVERITY_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Same "no timezone info, browser-local wall-clock string" format datetime-local expects -
// see MoodEntryForm's identical helper for the full explanation.
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface SymptomEntryFormProps {
  // Passed in by the Dashboard rather than fetched here, so the same GET /api/symptoms
  // response can be reused both for this picker and for rendering symptom names against the
  // recent-entries list - one fetch, one source of truth, instead of two independent copies
  // that could disagree if a symptom is created/edited mid-session.
  symptoms: Symptom[];
  onSaved: (log: SymptomLog) => void;
  onCancel: () => void;
  // Lets a user define their own symptom (e.g. "Anxiety") inline, without leaving this form -
  // mirrors MedicationEntryForm's "+ Add another medication" flow. The new symptom needs to be
  // reported back to the parent (rather than just added to local state here) because `symptoms`
  // is owned by the parent - it's reused both for this picker and for the recent-entries list,
  // per this form's existing "one fetch, one source of truth" design.
  onSymptomCreated: (symptom: Symptom) => void;
}

export function SymptomEntryForm({
  symptoms,
  onSaved,
  onCancel,
  onSymptomCreated,
}: SymptomEntryFormProps) {
  const [symptomId, setSymptomId] = useState("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [symptomError, setSymptomError] = useState<string | null>(null);
  const [severityError, setSeverityError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showAddSymptom, setShowAddSymptom] = useState(false);
  const [newSymptomName, setNewSymptomName] = useState("");
  const [addingSymptom, setAddingSymptom] = useState(false);
  const [addSymptomError, setAddSymptomError] = useState<string | null>(null);

  const selectId = useId();
  const severityDescriptionId = useId();

  // System symptoms (userId null) are available to every user; a user's own custom symptoms
  // are shown in their own group so the picker makes clear which is which, rather than one
  // flat alphabetical list that hides the distinction PATCH/DELETE actually enforce.
  const ownSymptoms = symptoms.filter((s) => s.userId !== null);
  const systemSymptoms = symptoms.filter((s) => s.userId === null);

  async function handleAddSymptom() {
    const name = newSymptomName.trim();
    if (!name) {
      setAddSymptomError("Enter a symptom name.");
      return;
    }
    setAddSymptomError(null);
    setAddingSymptom(true);
    try {
      const symptom = await apiFetch<Symptom>("/api/symptoms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      onSymptomCreated(symptom);
      setSymptomId(symptom.id);
      setSymptomError(null);
      setNewSymptomName("");
      setShowAddSymptom(false);
    } catch {
      setAddSymptomError("Couldn't add that symptom. Please try again.");
    } finally {
      setAddingSymptom(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let hasError = false;
    if (!symptomId) {
      setSymptomError("Choose a symptom.");
      hasError = true;
    } else {
      setSymptomError(null);
    }
    if (severity === null) {
      setSeverityError("Choose a severity.");
      hasError = true;
    } else {
      setSeverityError(null);
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      const log = await apiFetch<SymptomLog>("/api/symptom-logs", {
        method: "POST",
        body: JSON.stringify({
          symptomId,
          severity,
          notes: notes.trim() || undefined,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      onSaved(log);
    } catch {
      setFormError("Something went wrong saving your symptom. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-medium text-text">
          Symptom
        </label>
        <select
          id={selectId}
          value={symptomId}
          onChange={(e) => {
            setSymptomId(e.target.value);
            setSymptomError(null);
          }}
          className={`rounded-lg border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            symptomError ? "border-danger" : "border-border"
          }`}
          aria-invalid={symptomError ? true : undefined}
        >
          <option value="" disabled>
            Select a symptom…
          </option>
          {ownSymptoms.length > 0 && (
            <optgroup label="Your symptoms">
              {ownSymptoms.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          {systemSymptoms.length > 0 && (
            <optgroup label="Common symptoms">
              {systemSymptoms.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {symptomError && (
          <p role="alert" className="text-sm text-danger">
            {symptomError}
          </p>
        )}

        {!showAddSymptom && (
          <button
            type="button"
            onClick={() => setShowAddSymptom(true)}
            className="self-start text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            + Add another symptom
          </button>
        )}

        {showAddSymptom && (
          <div className="mt-1 flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label={ownSymptoms.length === 0 ? "Symptom name" : "New symptom name"}
                value={newSymptomName}
                onChange={(e) => setNewSymptomName(e.target.value)}
                error={addSymptomError ?? undefined}
                placeholder="e.g. Anxiety"
              />
            </div>
            <Button type="button" onClick={handleAddSymptom} disabled={addingSymptom}>
              {addingSymptom ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-text">Severity</legend>
        <div
          className="mt-2 grid grid-cols-5 gap-2"
          role="radiogroup"
          aria-label="Severity"
          aria-describedby={severityDescriptionId}
        >
          {SEVERITY_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={severity === n}
              onClick={() => {
                setSeverity(n);
                setSeverityError(null);
              }}
              className={`flex h-12 items-center justify-center rounded-lg border-2 text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                severity === n ? "border-brand bg-brand/10 text-brand" : "border-border text-text"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p id={severityDescriptionId} className="mt-1 text-xs text-text-muted">
          1 = Barely noticeable · 10 = Worst possible
        </p>
        {severityError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {severityError}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="symptom-notes" className="text-sm font-medium text-text">
          Notes (optional)
        </label>
        <textarea
          id="symptom-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="symptom-logged-at" className="text-sm font-medium text-text">
          Date &amp; time
        </label>
        <input
          id="symptom-logged-at"
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

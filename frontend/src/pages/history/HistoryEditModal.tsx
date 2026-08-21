import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { apiFetch } from "../../api/client";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { toDateTimeLocalValue } from "../../lib/dateTimeLocal";
import type { HistoryEntry } from "../HistoryPage";
import {
  fetchHabitLog,
  fetchMedicationLog,
  fetchMoodLog,
  fetchSymptomLog,
  habitLabel,
  medicationLabel,
  moodLabel,
  symptomLabel,
  type HabitLogRecord,
  type HabitRef,
  type MedicationLogRecord,
  type MedicationRef,
  type MoodLogRecord,
  type SymptomLogRecord,
  type SymptomRef,
} from "./historyLogApi";

interface HistoryEditModalProps {
  // null means "closed" - same convention as HistoryPage's own deletingEntry state, so the
  // Modal underneath can key its open/closed state directly off whether there's an entry to
  // show rather than a separate boolean that could drift out of sync with it.
  entry: HistoryEntry | null;
  onClose: () => void;
  onSaved: (updated: HistoryEntry) => void;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; view: ReadyView };

type ReadyView =
  | { kind: "mood"; log: MoodLogRecord }
  | { kind: "symptom"; log: SymptomLogRecord; symptoms: SymptomRef[] }
  | { kind: "medication"; log: MedicationLogRecord; medications: MedicationRef[] }
  | { kind: "habit"; log: HabitLogRecord; habits: HabitRef[] };

const TYPE_TITLE: Record<HistoryEntry["type"], string> = {
  mood: "Edit mood entry",
  symptom: "Edit symptom entry",
  medication: "Edit medication entry",
  habit: "Edit habit entry",
};

// Builds History's own pre-filled edit forms for all four log types, entirely self-contained
// (own fetching, own field state, own PATCH calls) rather than reusing MoodEntryForm /
// SymptomEntryForm / MedicationEntryForm / HabitEntryForm - see the "Important" note in this
// task's brief: those live alongside the Dashboard Section components another engineer is
// actively editing in parallel, so this deliberately duplicates the relevant form-building logic
// rather than importing from (or modifying) anything under that surface.
export function HistoryEditModal({ entry, onClose, onSaved }: HistoryEditModalProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        let view: ReadyView;
        if (entry.type === "mood") {
          const log = await fetchMoodLog(entry.id, entry.loggedAt);
          if (!log) throw new Error("Mood log not found");
          view = { kind: "mood", log };
        } else if (entry.type === "symptom") {
          const [log, symptoms] = await Promise.all([
            fetchSymptomLog(entry.id, entry.loggedAt),
            apiFetch<SymptomRef[]>("/api/symptoms"),
          ]);
          if (!log) throw new Error("Symptom log not found");
          view = { kind: "symptom", log, symptoms };
        } else if (entry.type === "medication") {
          const [log, medications] = await Promise.all([
            fetchMedicationLog(entry.id, entry.loggedAt),
            apiFetch<MedicationRef[]>("/api/medications"),
          ]);
          if (!log) throw new Error("Medication log not found");
          view = { kind: "medication", log, medications };
        } else {
          const [log, habits] = await Promise.all([
            fetchHabitLog(entry.id, entry.loggedAt),
            apiFetch<HabitRef[]>("/api/habits"),
          ]);
          if (!log) throw new Error("Habit log not found");
          view = { kind: "habit", log, habits };
        }
        if (!cancelled) setState({ status: "ready", view });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Modal open={!!entry} onClose={onClose} title={entry ? TYPE_TITLE[entry.type] : ""}>
      {state.status === "loading" && <p className="text-text-muted">Loading…</p>}
      {state.status === "error" && (
        <div>
          <p role="alert" className="text-danger">
            Couldn&apos;t load this entry. Please try again.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
      {state.status === "ready" && state.view.kind === "mood" && (
        <MoodEditForm log={state.view.log} onCancel={onClose} onSaved={onSaved} />
      )}
      {state.status === "ready" && state.view.kind === "symptom" && (
        <SymptomEditForm
          log={state.view.log}
          symptoms={state.view.symptoms}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
      {state.status === "ready" && state.view.kind === "medication" && (
        <MedicationEditForm
          log={state.view.log}
          medications={state.view.medications}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
      {state.status === "ready" && state.view.kind === "habit" && (
        <HabitEditForm
          log={state.view.log}
          habits={state.view.habits}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

// A row of selectable number buttons, shared by mood's energy/stress ratings and symptom's
// severity scale - same visual pattern as MoodEntryForm/SymptomEntryForm's own rating rows,
// rebuilt locally here (see the module-level comment on why this file doesn't import those).
function RatingGroup({
  label,
  values,
  value,
  onChange,
  clearable,
  columns,
}: {
  label: string;
  values: number[];
  value: number | null;
  onChange: (value: number | null) => void;
  // Energy/stress can be cleared back to "not set" by re-clicking the active value; severity
  // (always required) can't.
  clearable?: boolean;
  columns?: number;
}) {
  const descriptionId = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div
        className={columns ? `mt-2 grid gap-2` : "mt-2 flex flex-wrap gap-2"}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        role="radiogroup"
        aria-label={label}
        aria-describedby={descriptionId}
      >
        {values.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(clearable && value === n ? null : n)}
            className={`flex h-10 min-w-10 items-center justify-center rounded-lg border-2 px-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              value === n ? "border-brand bg-brand/10 text-brand" : "border-border text-text"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p id={descriptionId} className="sr-only">
        {values[0]} to {values[values.length - 1]}
      </p>
    </fieldset>
  );
}

function NotesField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        Notes (optional)
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
    </div>
  );
}

function DateTimeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        Date &amp; time
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
    </div>
  );
}

function FormActions({ submitting, onCancel }: { submitting: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-3">
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save Changes"}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
        Cancel
      </Button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}

// ---- Mood ------------------------------------------------------------------------------------

const MOOD_OPTIONS: Array<{ value: number; emoji: string; label: string }> = [
  { value: 1, emoji: "😞", label: "Bad" },
  { value: 2, emoji: "😕", label: "Not great" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];
const ENERGY_STRESS_VALUES = [1, 2, 3, 4, 5, 6, 7];

function MoodEditForm({
  log,
  onCancel,
  onSaved,
}: {
  log: MoodLogRecord;
  onCancel: () => void;
  onSaved: (updated: HistoryEntry) => void;
}) {
  const [mood, setMood] = useState<number | null>(log.mood);
  const [energy, setEnergy] = useState<number | null>(log.energy);
  const [stress, setStress] = useState<number | null>(log.stress);
  const [notes, setNotes] = useState(log.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date(log.loggedAt)));
  const [moodError, setMoodError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (mood === null) {
      setMoodError("Choose how you were feeling.");
      return;
    }
    setMoodError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<MoodLogRecord>(`/api/mood-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          mood,
          energy,
          stress,
          notes: notes.trim() || null,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      onSaved({
        id: updated.id,
        type: "mood",
        label: moodLabel(updated),
        notes: updated.notes,
        loggedAt: updated.loggedAt,
      });
    } catch {
      setFormError("Something went wrong saving this mood entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-text">How were they feeling?</legend>
        <div className="mt-2 flex justify-between gap-2" role="radiogroup" aria-label="Mood">
          {MOOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mood === option.value}
              aria-label={option.label}
              onClick={() => {
                setMood(option.value);
                setMoodError(null);
              }}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border-2 py-3 text-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                mood === option.value ? "border-brand bg-brand/10" : "border-border"
              }`}
            >
              <span aria-hidden="true">{option.emoji}</span>
              <span className="text-xs font-medium text-text-muted">{option.label}</span>
            </button>
          ))}
        </div>
        <FormError message={moodError} />
      </fieldset>

      <RatingGroup
        label="Energy (optional)"
        values={ENERGY_STRESS_VALUES}
        value={energy}
        onChange={setEnergy}
        clearable
      />
      <RatingGroup
        label="Stress (optional)"
        values={ENERGY_STRESS_VALUES}
        value={stress}
        onChange={setStress}
        clearable
      />

      <NotesField id="history-edit-mood-notes" value={notes} onChange={setNotes} />
      <DateTimeField id="history-edit-mood-logged-at" value={loggedAt} onChange={setLoggedAt} />
      <FormError message={formError} />
      <FormActions submitting={submitting} onCancel={onCancel} />
    </form>
  );
}

// ---- Symptom ---------------------------------------------------------------------------------

const SEVERITY_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function SymptomEditForm({
  log,
  symptoms,
  onCancel,
  onSaved,
}: {
  log: SymptomLogRecord;
  symptoms: SymptomRef[];
  onCancel: () => void;
  onSaved: (updated: HistoryEntry) => void;
}) {
  const [symptomId, setSymptomId] = useState(log.symptomId);
  const [severity, setSeverity] = useState<number | null>(log.severity);
  const [notes, setNotes] = useState(log.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date(log.loggedAt)));
  const [severityError, setSeverityError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectId = useId();

  const ownSymptoms = symptoms.filter((s) => s.userId !== null);
  const systemSymptoms = symptoms.filter((s) => s.userId === null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (severity === null) {
      setSeverityError("Choose a severity.");
      return;
    }
    setSeverityError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<SymptomLogRecord>(`/api/symptom-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          symptomId,
          severity,
          notes: notes.trim() || null,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      const symptomName = symptoms.find((s) => s.id === updated.symptomId)?.name ?? "Symptom";
      onSaved({
        id: updated.id,
        type: "symptom",
        label: symptomLabel(symptomName, updated.severity),
        notes: updated.notes,
        loggedAt: updated.loggedAt,
      });
    } catch {
      setFormError("Something went wrong saving this symptom entry. Please try again.");
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
          onChange={(e) => setSymptomId(e.target.value)}
          className="rounded-lg border border-border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
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
      </div>

      <RatingGroup
        label="Severity"
        values={SEVERITY_VALUES}
        value={severity}
        onChange={(v) => {
          setSeverity(v);
          setSeverityError(null);
        }}
        columns={5}
      />
      <FormError message={severityError} />

      <NotesField id="history-edit-symptom-notes" value={notes} onChange={setNotes} />
      <DateTimeField id="history-edit-symptom-logged-at" value={loggedAt} onChange={setLoggedAt} />
      <FormError message={formError} />
      <FormActions submitting={submitting} onCancel={onCancel} />
    </form>
  );
}

// ---- Medication --------------------------------------------------------------------------------

function ToggleGroup({
  label,
  value,
  onChange,
  trueLabel,
  falseLabel,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  trueLabel: ReactNode;
  falseLabel: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div className="mt-2 flex gap-3" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === true}
          onClick={() => onChange(true)}
          className={`flex-1 rounded-lg border-2 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            value === true ? "border-brand bg-brand/10 text-brand" : "border-border text-text"
          }`}
        >
          {trueLabel}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === false}
          onClick={() => onChange(false)}
          className={`flex-1 rounded-lg border-2 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            value === false ? "border-brand bg-brand/10 text-brand" : "border-border text-text"
          }`}
        >
          {falseLabel}
        </button>
      </div>
    </fieldset>
  );
}

function MedicationEditForm({
  log,
  medications,
  onCancel,
  onSaved,
}: {
  log: MedicationLogRecord;
  medications: MedicationRef[];
  onCancel: () => void;
  onSaved: (updated: HistoryEntry) => void;
}) {
  const [medicationId, setMedicationId] = useState(log.medicationId);
  const [taken, setTaken] = useState<boolean | null>(log.taken);
  const [notes, setNotes] = useState(log.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date(log.loggedAt)));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (taken === null) {
      setFormError("Choose whether it was taken.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await apiFetch<MedicationLogRecord>(`/api/medication-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          medicationId,
          taken,
          notes: notes.trim() || null,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      const medication = medications.find((m) => m.id === updated.medicationId);
      onSaved({
        id: updated.id,
        type: "medication",
        label: medicationLabel(
          medication?.name ?? "Medication",
          medication?.dosage ?? null,
          updated.taken,
        ),
        notes: updated.notes,
        loggedAt: updated.loggedAt,
      });
    } catch {
      setFormError("Something went wrong saving this medication entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-medium text-text">
          Which medication?
        </label>
        <select
          id={selectId}
          value={medicationId}
          onChange={(e) => setMedicationId(e.target.value)}
          className="rounded-lg border border-border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {medications.map((medication) => (
            <option key={medication.id} value={medication.id}>
              {medication.dosage ? `${medication.name} — ${medication.dosage}` : medication.name}
            </option>
          ))}
        </select>
      </div>

      <ToggleGroup
        label="Was it taken?"
        value={taken}
        onChange={setTaken}
        trueLabel={
          <>
            <span aria-hidden="true">✅</span> Taken
          </>
        }
        falseLabel={
          <>
            <span aria-hidden="true">❌</span> Not taken
          </>
        }
      />

      <NotesField id="history-edit-medication-notes" value={notes} onChange={setNotes} />
      <DateTimeField
        id="history-edit-medication-logged-at"
        value={loggedAt}
        onChange={setLoggedAt}
      />
      <FormError message={formError} />
      <FormActions submitting={submitting} onCancel={onCancel} />
    </form>
  );
}

// ---- Habit -------------------------------------------------------------------------------------

function HabitEditForm({
  log,
  habits,
  onCancel,
  onSaved,
}: {
  log: HabitLogRecord;
  habits: HabitRef[];
  onCancel: () => void;
  onSaved: (updated: HistoryEntry) => void;
}) {
  const habit = habits.find((h) => h.id === log.habitId);
  const [booleanValue, setBooleanValue] = useState<boolean | null>(log.valueBoolean);
  const [numericValue, setNumericValue] = useState(
    log.valueNumeric != null ? String(log.valueNumeric) : "",
  );
  const [durationValue, setDurationValue] = useState(
    log.valueDurationMinutes != null ? String(log.valueDurationMinutes) : "",
  );
  const [notes, setNotes] = useState(log.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date(log.loggedAt)));
  const [valueError, setValueError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!habit) {
      setFormError("This habit no longer exists.");
      return;
    }

    // habitId is immutable once a log exists (see backend/src/routes/habitLogs.ts's
    // updateSchema, which deliberately omits it) - the same "which single value field applies"
    // check the backend does in extractTypedValue, done here first purely as a UX shortcut.
    let valueFields: {
      valueBoolean?: boolean;
      valueNumeric?: number;
      valueDurationMinutes?: number;
    };
    if (habit.type === "boolean") {
      if (booleanValue === null) {
        setValueError("Choose Yes or No.");
        return;
      }
      valueFields = { valueBoolean: booleanValue };
    } else if (habit.type === "numeric") {
      const parsed = Number(numericValue);
      if (numericValue.trim() === "" || !Number.isFinite(parsed)) {
        setValueError("Enter a number.");
        return;
      }
      valueFields = { valueNumeric: parsed };
    } else {
      const parsed = Number(durationValue);
      if (durationValue.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
        setValueError("Enter a whole number of minutes, 0 or more.");
        return;
      }
      valueFields = { valueDurationMinutes: parsed };
    }
    setValueError(null);

    setSubmitting(true);
    try {
      const updated = await apiFetch<HabitLogRecord>(`/api/habit-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...valueFields,
          notes: notes.trim() || null,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
      onSaved({
        id: updated.id,
        type: "habit",
        label: habitLabel(habit.name, updated),
        notes: updated.notes,
        loggedAt: updated.loggedAt,
      });
    } catch {
      setFormError("Something went wrong saving this habit entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text">Habit</span>
        {/* Which habit a log belongs to can't be changed after creation (see updateSchema in
            habitLogs.ts) - shown as plain text rather than a locked <select>, matching
            HabitEntryForm's own disabled-picker-while-editing behavior in spirit. */}
        <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-base text-text">
          {habit?.name ?? "Unknown habit"}
        </p>
      </div>

      {habit?.type === "boolean" && (
        <ToggleGroup
          label="Completed?"
          value={booleanValue}
          onChange={(v) => {
            setBooleanValue(v);
            setValueError(null);
          }}
          trueLabel="Yes"
          falseLabel="No"
        />
      )}

      {habit?.type === "numeric" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="history-edit-habit-numeric" className="text-sm font-medium text-text">
            Value
          </label>
          <input
            id="history-edit-habit-numeric"
            type="number"
            step="any"
            inputMode="decimal"
            value={numericValue}
            onChange={(e) => {
              setNumericValue(e.target.value);
              setValueError(null);
            }}
            className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        </div>
      )}

      {habit?.type === "duration" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="history-edit-habit-duration" className="text-sm font-medium text-text">
            Duration (minutes)
          </label>
          <input
            id="history-edit-habit-duration"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={durationValue}
            onChange={(e) => {
              setDurationValue(e.target.value);
              setValueError(null);
            }}
            className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        </div>
      )}
      <FormError message={valueError} />

      <NotesField id="history-edit-habit-notes" value={notes} onChange={setNotes} />
      <DateTimeField id="history-edit-habit-logged-at" value={loggedAt} onChange={setLoggedAt} />
      <FormError message={formError} />
      <FormActions submitting={submitting} onCancel={onCancel} />
    </form>
  );
}

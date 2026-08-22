import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { toDateTimeLocalValue } from "../lib/dateTimeLocal";
import { Button } from "./Button";
import { DateTimeField } from "./DateTimeField";
import type { Habit } from "./HabitCreateForm";

export interface HabitLog {
  id: string;
  userId: string;
  habitId: string;
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
  notes: string | null;
  loggedAt: string;
}

interface HabitEntryFormProps {
  habits: Habit[];
  /** Pre-selects a just-created habit (see DashboardPage's "create a habit first" flow). */
  initialHabitId?: string | null;
  onSaved: (log: HabitLog) => void;
  onCancel: () => void;
  /** Lets the user jump to "define a new habit" without leaving this form entirely. */
  onAddHabit: () => void;
  // When present, the form starts pre-filled with this log's values and PATCHes it on submit
  // instead of POSTing a new one - see MoodEntryForm's identical editingLog prop for the full
  // explanation of why one form serves both create and edit. Unlike the other three log types,
  // habitId is immutable once a log exists (see backend's habitLogs.ts updateSchema, which
  // deliberately omits it), so the habit picker is locked to editingLog's habit while editing.
  editingLog?: HabitLog | null;
}

export function HabitEntryForm({
  habits,
  initialHabitId,
  onSaved,
  onCancel,
  onAddHabit,
  editingLog,
}: HabitEntryFormProps) {
  const [habitId, setHabitId] = useState(
    editingLog?.habitId ?? initialHabitId ?? habits[0]?.id ?? "",
  );
  const [booleanValue, setBooleanValue] = useState<boolean | null>(
    editingLog?.valueBoolean ?? null,
  );
  const [numericValue, setNumericValue] = useState(
    editingLog?.valueNumeric != null ? String(editingLog.valueNumeric) : "",
  );
  const [durationValue, setDurationValue] = useState(
    editingLog?.valueDurationMinutes != null ? String(editingLog.valueDurationMinutes) : "",
  );
  const [notes, setNotes] = useState(editingLog?.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() =>
    toDateTimeLocalValue(editingLog ? new Date(editingLog.loggedAt) : new Date()),
  );
  const [valueError, setValueError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedHabit = habits.find((h) => h.id === habitId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!selectedHabit) {
      setFormError("Choose a habit to log.");
      return;
    }

    // The exact same "which single value field applies" question the backend answers in
    // extractTypedValue (habitLogs.ts) - answered here first so the user gets an inline error
    // instead of a round trip to the server for a mistake the UI already knows about (the
    // server still re-validates independently; this is a UX shortcut, not the source of truth).
    let valueFields: {
      valueBoolean?: boolean;
      valueNumeric?: number;
      valueDurationMinutes?: number;
    };
    if (selectedHabit.type === "boolean") {
      if (booleanValue === null) {
        setValueError("Choose Yes or No.");
        return;
      }
      valueFields = { valueBoolean: booleanValue };
    } else if (selectedHabit.type === "numeric") {
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
      const log = await apiFetch<HabitLog>(
        editingLog ? `/api/habit-logs/${editingLog.id}` : "/api/habit-logs",
        {
          method: editingLog ? "PATCH" : "POST",
          body: JSON.stringify({
            // habitId is immutable on update (see updateSchema in habitLogs.ts) - only sent
            // when creating a brand new log.
            ...(editingLog ? {} : { habitId: selectedHabit.id }),
            ...valueFields,
            // Create omits an empty value (nothing to clear yet); edit sends an explicit
            // `null` so clearing previously-entered notes text actually clears it, rather
            // than the omitted key silently leaving the old value in the database - see
            // backend/src/routes/habitLogs.ts's updateSchema.
            notes: notes.trim() || (editingLog ? null : undefined),
            loggedAt: new Date(loggedAt).toISOString(),
          }),
        },
      );
      onSaved(log);
    } catch {
      setFormError("Something went wrong saving your habit entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="habit-picker" className="text-sm font-medium text-text">
          Habit
        </label>
        <select
          id="habit-picker"
          value={habitId}
          // Which habit a log belongs to can't be changed after creation (see updateSchema in
          // habitLogs.ts) - locking the picker while editing avoids implying a change here
          // would actually move the log to a different habit.
          disabled={!!editingLog}
          onChange={(e) => {
            setHabitId(e.target.value);
            setBooleanValue(null);
            setNumericValue("");
            setDurationValue("");
            setValueError(null);
          }}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {habits.map((habit) => (
            <option key={habit.id} value={habit.id}>
              {habit.name}
            </option>
          ))}
        </select>
        {!editingLog && (
          <button
            type="button"
            onClick={onAddHabit}
            className="self-start text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            + Add a new habit
          </button>
        )}
      </div>

      {selectedHabit?.type === "boolean" && (
        <fieldset>
          <legend className="text-sm font-medium text-text">Completed?</legend>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Completed?">
            {[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={booleanValue === option.value}
                onClick={() => {
                  setBooleanValue(option.value);
                  setValueError(null);
                }}
                className={`flex-1 rounded-lg border-2 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  booleanValue === option.value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-text"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {selectedHabit?.type === "numeric" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="habit-numeric-value" className="text-sm font-medium text-text">
            Value
          </label>
          <input
            id="habit-numeric-value"
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

      {selectedHabit?.type === "duration" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="habit-duration-value" className="text-sm font-medium text-text">
            Duration (minutes)
          </label>
          <input
            id="habit-duration-value"
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

      {valueError && (
        <p role="alert" className="text-sm text-danger">
          {valueError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="habit-notes" className="text-sm font-medium text-text">
          Notes (optional)
        </label>
        <textarea
          id="habit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <DateTimeField id="habit-logged-at" value={loggedAt} onChange={setLoggedAt} />

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editingLog ? "Save Changes" : "Save Entry"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

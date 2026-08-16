import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { toDateTimeLocalValue } from "../lib/dateTimeLocal";
import { Button } from "./Button";
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
}

export function HabitEntryForm({
  habits,
  initialHabitId,
  onSaved,
  onCancel,
  onAddHabit,
}: HabitEntryFormProps) {
  const [habitId, setHabitId] = useState(initialHabitId ?? habits[0]?.id ?? "");
  const [booleanValue, setBooleanValue] = useState<boolean | null>(null);
  const [numericValue, setNumericValue] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date()));
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
    let body: {
      habitId: string;
      valueBoolean?: boolean;
      valueNumeric?: number;
      valueDurationMinutes?: number;
    };
    if (selectedHabit.type === "boolean") {
      if (booleanValue === null) {
        setValueError("Choose Yes or No.");
        return;
      }
      body = { habitId: selectedHabit.id, valueBoolean: booleanValue };
    } else if (selectedHabit.type === "numeric") {
      const parsed = Number(numericValue);
      if (numericValue.trim() === "" || !Number.isFinite(parsed)) {
        setValueError("Enter a number.");
        return;
      }
      body = { habitId: selectedHabit.id, valueNumeric: parsed };
    } else {
      const parsed = Number(durationValue);
      if (durationValue.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
        setValueError("Enter a whole number of minutes, 0 or more.");
        return;
      }
      body = { habitId: selectedHabit.id, valueDurationMinutes: parsed };
    }
    setValueError(null);

    setSubmitting(true);
    try {
      const log = await apiFetch<HabitLog>("/api/habit-logs", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          notes: notes.trim() || undefined,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
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
          onChange={(e) => {
            setHabitId(e.target.value);
            setBooleanValue(null);
            setNumericValue("");
            setDurationValue("");
            setValueError(null);
          }}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {habits.map((habit) => (
            <option key={habit.id} value={habit.id}>
              {habit.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAddHabit}
          className="self-start text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          + Add a new habit
        </button>
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

      <div className="flex flex-col gap-1">
        <label htmlFor="habit-logged-at" className="text-sm font-medium text-text">
          Date &amp; time
        </label>
        <input
          id="habit-logged-at"
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

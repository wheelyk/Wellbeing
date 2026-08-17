import { useId, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { toDateTimeLocalValue } from "../lib/dateTimeLocal";
import { Button } from "./Button";

export interface MoodLog {
  id: string;
  userId: string;
  mood: number;
  energy: number | null;
  stress: number | null;
  notes: string | null;
  loggedAt: string;
}

const MOOD_OPTIONS: Array<{ value: number; emoji: string; label: string }> = [
  { value: 1, emoji: "😞", label: "Bad" },
  { value: 2, emoji: "😕", label: "Not great" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

// One point past mood's 1-5 range so a true midpoint (4) exists for "neither low nor high" -
// a 1-5 or 1-6 range either lacks that clean center or offers too little granularity, per real
// user feedback on the original 1-5 scale.
const ENERGY_STRESS_VALUES = [1, 2, 3, 4, 5, 6, 7];

interface MoodEntryFormProps {
  // When present, the form starts pre-filled with this log's values and PATCHes it on submit
  // instead of POSTing a new one - the same form serves both "log a mood" and "edit a mood
  // entry" so the two flows can never drift apart. Absent (or null), behavior is unchanged
  // from before edit support existed.
  editingLog?: MoodLog | null;
  onSaved: (log: MoodLog) => void;
  onCancel: () => void;
}

export function MoodEntryForm({ editingLog, onSaved, onCancel }: MoodEntryFormProps) {
  const [mood, setMood] = useState<number | null>(editingLog?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(editingLog?.energy ?? null);
  const [stress, setStress] = useState<number | null>(editingLog?.stress ?? null);
  const [notes, setNotes] = useState(editingLog?.notes ?? "");
  const [loggedAt, setLoggedAt] = useState(() =>
    toDateTimeLocalValue(editingLog ? new Date(editingLog.loggedAt) : new Date()),
  );
  const [moodError, setMoodError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (mood === null) {
      setMoodError("Choose how you're feeling.");
      return;
    }
    setMoodError(null);

    setSubmitting(true);
    try {
      const log = await apiFetch<MoodLog>(
        editingLog ? `/api/mood-logs/${editingLog.id}` : "/api/mood-logs",
        {
          method: editingLog ? "PATCH" : "POST",
          body: JSON.stringify({
            mood,
            // energy/stress are nullable on both create and update, so sending the raw
            // value (never coerced to `undefined`) is correct either way: on create, an
            // explicit `null` and an omitted key both leave the column unset; on edit, only
            // the explicit `null` actually clears a previously-set rating - `undefined` would
            // be dropped by JSON.stringify and silently leave the old value in the database
            // (see backend/src/routes/moodLogs.ts's updateSchema for the other half of this).
            energy,
            stress,
            // notes has no database default to fall back on the way energy/stress do, and the
            // create schema doesn't accept `null` (no "clear" concept when there's nothing yet
            // to clear) - so create still omits an empty value, while edit sends an explicit
            // `null` to actually clear existing notes text.
            notes: notes.trim() || (editingLog ? null : undefined),
            loggedAt: new Date(loggedAt).toISOString(),
          }),
        },
      );
      onSaved(log);
    } catch {
      setFormError("Something went wrong saving your mood. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-text">How are you feeling?</legend>
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
        {moodError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {moodError}
          </p>
        )}
      </fieldset>

      <RatingRow
        label="Energy (optional)"
        value={energy}
        onChange={setEnergy}
        lowLabel="No energy"
        highLabel="Maximum energy"
      />
      <RatingRow
        label="Stress (optional)"
        value={stress}
        onChange={setStress}
        lowLabel="No stress"
        highLabel="Maximum stress"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="mood-notes" className="text-sm font-medium text-text">
          Notes (optional)
        </label>
        <textarea
          id="mood-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mood-logged-at" className="text-sm font-medium text-text">
          Date &amp; time
        </label>
        <input
          id="mood-logged-at"
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
          {submitting ? "Saving…" : editingLog ? "Save Changes" : "Save Entry"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RatingRow({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const descriptionId = useId();

  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div
        className="mt-2 flex gap-2"
        role="radiogroup"
        aria-label={label}
        aria-describedby={descriptionId}
      >
        {ENERGY_STRESS_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            // Clicking an already-selected rating clears it, since these fields are
            // optional and there's otherwise no way to "unselect" back to not-set.
            onClick={() => onChange(value === n ? null : n)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              value === n ? "border-brand bg-brand/10 text-brand" : "border-border text-text"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p id={descriptionId} className="mt-1 text-xs text-text-muted">
        1 = {lowLabel} · {ENERGY_STRESS_VALUES[ENERGY_STRESS_VALUES.length - 1]} = {highLabel}
      </p>
    </fieldset>
  );
}

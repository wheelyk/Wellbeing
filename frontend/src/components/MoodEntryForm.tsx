import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
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

const RATING_VALUES = [1, 2, 3, 4, 5];

// Formats a Date as the value a <input type="datetime-local"> expects (local time,
// "YYYY-MM-DDTHH:mm") - the input has no concept of timezones, it just shows/edits
// whatever local wall-clock time the browser is set to.
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface MoodEntryFormProps {
  onSaved: (log: MoodLog) => void;
  onCancel: () => void;
}

export function MoodEntryForm({ onSaved, onCancel }: MoodEntryFormProps) {
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(() => toDateTimeLocalValue(new Date()));
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
      const log = await apiFetch<MoodLog>("/api/mood-logs", {
        method: "POST",
        body: JSON.stringify({
          mood,
          energy: energy ?? undefined,
          stress: stress ?? undefined,
          notes: notes.trim() || undefined,
          loggedAt: new Date(loggedAt).toISOString(),
        }),
      });
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

      <RatingRow label="Energy (optional)" value={energy} onChange={setEnergy} />
      <RatingRow label="Stress (optional)" value={stress} onChange={setStress} />

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
          {submitting ? "Saving…" : "Save Entry"}
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
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label={label}>
        {RATING_VALUES.map((n) => (
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
    </fieldset>
  );
}

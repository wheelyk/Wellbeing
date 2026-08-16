import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./Button";
import { TextField } from "./TextField";

export interface Habit {
  id: string;
  userId: string;
  name: string;
  type: "boolean" | "numeric" | "duration";
  createdAt: string;
}

const TYPE_OPTIONS: Array<{ value: Habit["type"]; label: string; hint: string }> = [
  { value: "boolean", label: "Yes / No", hint: "e.g. Exercised today" },
  { value: "numeric", label: "Number", hint: "e.g. Glasses of water" },
  { value: "duration", label: "Duration", hint: "e.g. Minutes walked" },
];

interface HabitCreateFormProps {
  onCreated: (habit: Habit) => void;
  onCancel: () => void;
}

// A small, focused "define a habit" form - deliberately not a full habit-management screen
// (renaming/deleting habits already live on the Dashboard's habit list itself via habits.ts's
// existing PATCH/DELETE routes, reached elsewhere). This form exists only to unblock the "I
// have no habits yet" empty state so logging a habit is genuinely usable end to end without a
// separate settings-style page.
export function HabitCreateForm({ onCreated, onCancel }: HabitCreateFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Habit["type"] | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let hasError = false;
    if (!name.trim()) {
      setNameError("Give this habit a name.");
      hasError = true;
    } else {
      setNameError(null);
    }
    if (!type) {
      setTypeError("Choose how this habit is tracked.");
      hasError = true;
    } else {
      setTypeError(null);
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      const habit = await apiFetch<Habit>("/api/habits", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type }),
      });
      onCreated(habit);
    } catch {
      setFormError("Something went wrong creating your habit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <TextField
        label="Habit name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError ?? undefined}
        placeholder="e.g. Exercise"
      />

      <fieldset>
        <legend className="text-sm font-medium text-text">How is it tracked?</legend>
        <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label="Habit type">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              onClick={() => {
                setType(option.value);
                setTypeError(null);
              }}
              className={`flex flex-col items-start rounded-lg border-2 px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                type === option.value ? "border-brand bg-brand/10" : "border-border"
              }`}
            >
              <span className="text-sm font-medium text-text">{option.label}</span>
              <span className="text-xs text-text-muted">{option.hint}</span>
            </button>
          ))}
        </div>
        {typeError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {typeError}
          </p>
        )}
      </fieldset>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create Habit"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { PushPermissionDeniedError } from "../lib/pushNotifications";
import { Button } from "./Button";
import { TextField } from "./TextField";
import type { Category } from "./CategoryCreateForm";
import type { Medication } from "./MedicationEntryForm";

export type ReminderTarget = "general" | "mood" | "symptom" | "medication" | "category";

export interface Reminder {
  id: string;
  userId: string;
  target: ReminderTarget;
  medicationId: string | null;
  categoryId: string | null;
  times: string[];
  enabled: boolean;
  createdAt: string;
  medication: { name: string; dosage: string | null } | null;
  category: { name: string; icon: string | null } | null;
}

export interface ReminderCreateInput {
  target: ReminderTarget;
  medicationId?: string;
  categoryId?: string;
  times: string[];
}

const TARGET_OPTIONS: Array<{ value: ReminderTarget; label: string; hint: string }> = [
  { value: "general", label: "General", hint: "Nudge if nothing's been logged at all yet" },
  { value: "mood", label: "Mood", hint: "Nudge if mood hasn't been logged today" },
  { value: "symptom", label: "Symptom", hint: "Nudge if no symptom has been logged today" },
  { value: "medication", label: "A specific medication", hint: "e.g. Diazepam every morning" },
  { value: "category", label: "A specific category", hint: "e.g. Water intake every few hours" },
];

interface ReminderCreateFormProps {
  medications: Medication[];
  categories: Category[];
  // The parent (RemindersSection) owns whether this create needs to run the push-subscribe flow
  // first (only when it's about to become the account's first-ever enabled reminder) - this form
  // only ever gathers and validates input, then hands it off. Whatever this rejects with (an
  // ApiError, PushPermissionDeniedError, or anything else) is what decides the message shown
  // below, so the parent should let the real error through rather than swallowing it.
  onSubmit: (input: ReminderCreateInput) => Promise<void>;
  onCancel: () => void;
}

// The "+ Add reminder" form - a target-type picker (mirrors CategoryCreateForm's own radiogroup
// pattern for "how is this tracked"), a second picker that only appears for Medication/Category
// (fetched by the parent, since it already needs both lists for the archived-category cross-check
// on the reminders list itself), and a repeatable list of plain `<input type="time">` rows - no
// interval-math helper, since fixed times approximating "every N hours" is deliberately the whole
// point (confirmed directly with the project owner - see docs/log/16-reminders-and-category-
// toggles.md's Task 2 entry).
export function ReminderCreateForm({
  medications,
  categories,
  onSubmit,
  onCancel,
}: ReminderCreateFormProps) {
  const [target, setTarget] = useState<ReminderTarget | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [medicationId, setMedicationId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subPickerError, setSubPickerError] = useState<string | null>(null);
  const [times, setTimes] = useState<string[]>([""]);
  const [timesError, setTimesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleTimeChange(index: number, value: string) {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function handleAddTime() {
    setTimes((prev) => [...prev, ""]);
  }

  function handleRemoveTime(index: number) {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let hasError = false;
    if (!target) {
      setTargetError("Choose what this reminder is for.");
      hasError = true;
    } else {
      setTargetError(null);
    }

    if (target === "medication" && !medicationId) {
      setSubPickerError(
        medications.length === 0
          ? "Add a medication in the Medications section above first."
          : "Choose which medication.",
      );
      hasError = true;
    } else if (target === "category" && !categoryId) {
      setSubPickerError(
        categories.length === 0 ? "Add a category below first." : "Choose which category.",
      );
      hasError = true;
    } else {
      setSubPickerError(null);
    }

    const filteredTimes = times.map((t) => t.trim()).filter(Boolean);
    if (filteredTimes.length === 0) {
      setTimesError("At least one time is required.");
      hasError = true;
    } else {
      setTimesError(null);
    }

    if (hasError || !target) return;

    setSubmitting(true);
    try {
      await onSubmit({
        target,
        medicationId: target === "medication" ? (medicationId as string) : undefined,
        categoryId: target === "category" ? (categoryId as string) : undefined,
        times: filteredTimes,
      });
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        setFormError(
          "Notifications were blocked. Allow notifications for this site in your browser's settings, then try again.",
        );
      } else if (err instanceof ApiError && err.code === "REMINDER_ALREADY_EXISTS") {
        setFormError("You already have a reminder for this.");
      } else if (
        err instanceof ApiError &&
        (err.code === "MEDICATION_NOT_FOUND" || err.code === "CATEGORY_NOT_FOUND")
      ) {
        setFormError("That couldn't be found - please refresh the page and try again.");
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setFormError("Please check the highlighted fields.");
      } else {
        setFormError("Something went wrong creating your reminder. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-text">What's this reminder for?</legend>
        <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label="Reminder target">
          {TARGET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={target === option.value}
              onClick={() => {
                setTarget(option.value);
                setTargetError(null);
                setMedicationId(null);
                setCategoryId(null);
                setSubPickerError(null);
              }}
              className={`flex flex-col items-start rounded-lg border-2 px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                target === option.value ? "border-brand bg-brand/10" : "border-border"
              }`}
            >
              <span className="text-sm font-medium text-text">{option.label}</span>
              <span className="text-xs text-text-muted">{option.hint}</span>
            </button>
          ))}
        </div>
        {targetError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {targetError}
          </p>
        )}
      </fieldset>

      {target === "medication" && (
        <fieldset>
          <legend className="text-sm font-medium text-text">Which medication?</legend>
          {medications.length > 0 && (
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
                  aria-checked={medicationId === medication.id}
                  onClick={() => {
                    setMedicationId(medication.id);
                    setSubPickerError(null);
                  }}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    medicationId === medication.id
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
          {subPickerError && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {subPickerError}
            </p>
          )}
        </fieldset>
      )}

      {target === "category" && (
        <fieldset>
          <legend className="text-sm font-medium text-text">Which category?</legend>
          {categories.length > 0 && (
            <div
              className="mt-2 flex flex-col gap-2"
              role="radiogroup"
              aria-label="Which category?"
            >
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === category.id}
                  onClick={() => {
                    setCategoryId(category.id);
                    setSubPickerError(null);
                  }}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    categoryId === category.id
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-text"
                  }`}
                >
                  {category.icon ? `${category.icon} ` : ""}
                  {category.name}
                </button>
              ))}
            </div>
          )}
          {subPickerError && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {subPickerError}
            </p>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-text">What time(s)?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {times.map((time, index) => (
            <div key={index} className="flex items-end gap-2">
              <TextField
                label={`Time ${index + 1}`}
                type="time"
                value={time}
                onChange={(e) => handleTimeChange(index, e.target.value)}
                className="w-40"
              />
              {times.length > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleRemoveTime(index)}
                  aria-label={`Remove time ${index + 1}`}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
        {times.length < 6 && (
          <button
            type="button"
            onClick={handleAddTime}
            className="mt-2 text-sm font-medium text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            + Add another time
          </button>
        )}
        {timesError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {timesError}
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
          {submitting ? "Creating…" : "Create reminder"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

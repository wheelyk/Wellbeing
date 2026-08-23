import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { toDateTimeLocalValue } from "../lib/dateTimeLocal";
import { Button } from "./Button";
import { DateTimeField } from "./DateTimeField";
import { RatingScale } from "./RatingScale";
import type { Category } from "./CategoryCreateForm";

export interface CategoryLog {
  id: string;
  userId: string;
  categoryId: string;
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
  notes: string | null;
  loggedAt: string;
}

interface CategoryEntryFormProps {
  categories: Category[];
  /** Pre-selects a just-created category (mirrors HabitEntryForm's initialHabitId). */
  initialCategoryId?: string | null;
  onSaved: (log: CategoryLog) => void;
  onCancel: () => void;
  /** Lets the user jump to "define a new category" without leaving this form entirely. */
  onAddCategory: () => void;
  // Same create/edit dual-purpose shape as HabitEntryForm's editingLog - categoryId is immutable
  // once a log exists (see backend's categoryLogs.ts updateSchema), so the picker is locked to
  // editingLog's category while editing.
  editingLog?: CategoryLog | null;
}

export function CategoryEntryForm({
  categories,
  initialCategoryId,
  onSaved,
  onCancel,
  onAddCategory,
  editingLog,
}: CategoryEntryFormProps) {
  const [categoryId, setCategoryId] = useState(
    editingLog?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? "",
  );
  const [booleanValue, setBooleanValue] = useState<boolean | null>(
    editingLog?.valueBoolean ?? null,
  );
  const [numericValue, setNumericValue] = useState(
    editingLog?.valueNumeric != null ? String(editingLog.valueNumeric) : "",
  );
  // Scale shares CategoryLog's valueNumeric column with plain "numeric" - kept as its own piece
  // of state here only because it's edited with RatingScale (a number-or-null picker) rather
  // than a free-text number input.
  const [scaleValue, setScaleValue] = useState<number | null>(editingLog?.valueNumeric ?? null);
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

  const selectedCategory = categories.find((c) => c.id === categoryId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!selectedCategory) {
      setFormError("Choose a category to log.");
      return;
    }

    // The exact same "which single value field applies" question the backend answers in
    // extractTypedValue (categoryLogs.ts) - answered here first for a fast inline error; the
    // server still re-validates independently, including scale bounds this form never checks
    // itself (RatingScale's own value list is already built from the category's bounds, so an
    // out-of-range value can't be picked here in the first place).
    let valueFields: {
      valueBoolean?: boolean;
      valueNumeric?: number;
      valueDurationMinutes?: number;
    };
    if (selectedCategory.valueType === "boolean") {
      if (booleanValue === null) {
        setValueError("Choose Yes or No.");
        return;
      }
      valueFields = { valueBoolean: booleanValue };
    } else if (selectedCategory.valueType === "numeric") {
      const parsed = Number(numericValue);
      if (numericValue.trim() === "" || !Number.isFinite(parsed)) {
        setValueError("Enter a number.");
        return;
      }
      valueFields = { valueNumeric: parsed };
    } else if (selectedCategory.valueType === "scale") {
      if (scaleValue === null) {
        setValueError("Choose a value on the scale.");
        return;
      }
      valueFields = { valueNumeric: scaleValue };
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
      const log = await apiFetch<CategoryLog>(
        editingLog ? `/api/category-logs/${editingLog.id}` : "/api/category-logs",
        {
          method: editingLog ? "PATCH" : "POST",
          body: JSON.stringify({
            // categoryId is immutable on update (see updateSchema in categoryLogs.ts) - only
            // sent when creating a brand new log.
            ...(editingLog ? {} : { categoryId: selectedCategory.id }),
            ...valueFields,
            notes: notes.trim() || (editingLog ? null : undefined),
            loggedAt: new Date(loggedAt).toISOString(),
          }),
        },
      );
      onSaved(log);
    } catch {
      setFormError("Something went wrong saving your entry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const scaleValues =
    selectedCategory?.valueType === "scale" &&
    selectedCategory.scaleMin !== null &&
    selectedCategory.scaleMax !== null
      ? Array.from(
          { length: selectedCategory.scaleMax - selectedCategory.scaleMin + 1 },
          (_, i) => (selectedCategory.scaleMin as number) + i,
        )
      : [];

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="category-picker" className="text-sm font-medium text-text">
          Category
        </label>
        <select
          id="category-picker"
          value={categoryId}
          disabled={!!editingLog}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setBooleanValue(null);
            setNumericValue("");
            setScaleValue(null);
            setDurationValue("");
            setValueError(null);
          }}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon ? `${category.icon} ` : ""}
              {category.name}
            </option>
          ))}
        </select>
        {!editingLog && (
          <button
            type="button"
            onClick={onAddCategory}
            className="self-start text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            + Add a new category
          </button>
        )}
      </div>

      {selectedCategory?.valueType === "boolean" && (
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

      {selectedCategory?.valueType === "numeric" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="category-numeric-value" className="text-sm font-medium text-text">
            Value
          </label>
          <input
            id="category-numeric-value"
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

      {selectedCategory?.valueType === "scale" && (
        <RatingScale
          label={selectedCategory.name}
          values={scaleValues}
          value={scaleValue}
          onChange={(v) => {
            setScaleValue(v);
            setValueError(null);
          }}
          lowLabel="Low"
          highLabel="High"
        />
      )}

      {selectedCategory?.valueType === "duration" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="category-duration-value" className="text-sm font-medium text-text">
            Duration (minutes)
          </label>
          <input
            id="category-duration-value"
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
        <label htmlFor="category-notes" className="text-sm font-medium text-text">
          Notes (optional)
        </label>
        <textarea
          id="category-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      <DateTimeField id="category-logged-at" value={loggedAt} onChange={setLoggedAt} />

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

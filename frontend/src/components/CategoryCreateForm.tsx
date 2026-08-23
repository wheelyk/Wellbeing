import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./Button";
import { TextField } from "./TextField";

export interface Category {
  id: string;
  userId: string | null;
  name: string;
  icon: string | null;
  valueType: "boolean" | "numeric" | "scale" | "duration";
  scaleMin: number | null;
  scaleMax: number | null;
  archivedAt: string | null;
  createdAt: string;
}

const TYPE_OPTIONS: Array<{ value: Category["valueType"]; label: string; hint: string }> = [
  { value: "boolean", label: "Yes / No", hint: "e.g. Read today" },
  { value: "numeric", label: "Number", hint: "e.g. Glasses of water" },
  { value: "scale", label: "Scale", hint: "e.g. Energy level, 1-5" },
  { value: "duration", label: "Duration", hint: "e.g. Minutes meditated" },
];

interface CategoryCreateFormProps {
  onCreated: (category: Category) => void;
  onCancel: () => void;
}

// A small, focused "define a category" form - the same role HabitCreateForm plays for habits,
// generalized to four value types (including the new "scale" type, a bounded picker generalizing
// what Mood/Symptom already do with their own fixed scales) since a category isn't limited to
// habit's original three.
export function CategoryCreateForm({ onCreated, onCancel }: CategoryCreateFormProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [type, setType] = useState<Category["valueType"] | null>(null);
  const [scaleMin, setScaleMin] = useState("1");
  const [scaleMax, setScaleMax] = useState("5");
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let hasError = false;
    if (!name.trim()) {
      setNameError("Give this category a name.");
      hasError = true;
    } else {
      setNameError(null);
    }
    if (!type) {
      setTypeError("Choose how this is tracked.");
      hasError = true;
    } else {
      setTypeError(null);
    }

    // The exact same "scaleMin < scaleMax, both required for a scale category" check the backend
    // re-validates independently (see categories.ts's createSchema) - answered here first so the
    // user gets an inline error instead of a round trip for a mistake the UI already knows about.
    let scaleFields: { scaleMin?: number; scaleMax?: number } = {};
    if (type === "scale") {
      const min = Number(scaleMin);
      const max = Number(scaleMax);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
        setScaleError("Enter whole numbers, with the low end less than the high end.");
        hasError = true;
      } else {
        setScaleError(null);
        scaleFields = { scaleMin: min, scaleMax: max };
      }
    } else {
      setScaleError(null);
    }

    if (hasError) return;

    setSubmitting(true);
    try {
      const category = await apiFetch<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          valueType: type,
          icon: icon.trim() || undefined,
          ...scaleFields,
        }),
      });
      onCreated(category);
    } catch {
      setFormError("Something went wrong creating your category. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <TextField
        label="Category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError ?? undefined}
        placeholder="e.g. Water intake"
      />

      <TextField
        label="Icon (optional)"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        placeholder="e.g. 💧"
        maxLength={8}
      />

      <fieldset>
        <legend className="text-sm font-medium text-text">How is it tracked?</legend>
        <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label="Category type">
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

      {type === "scale" && (
        <div className="flex gap-3">
          <TextField
            label="Low end"
            type="number"
            value={scaleMin}
            onChange={(e) => setScaleMin(e.target.value)}
          />
          <TextField
            label="High end"
            type="number"
            value={scaleMax}
            onChange={(e) => setScaleMax(e.target.value)}
          />
        </div>
      )}
      {scaleError && (
        <p role="alert" className="text-sm text-danger">
          {scaleError}
        </p>
      )}

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create Category"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

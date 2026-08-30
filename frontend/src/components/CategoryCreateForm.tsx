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
  // Optional (see backend's schema.prisma Category.groupId comment) - null means "Uncategorized,"
  // a normal, supported state, not a category that's missing something. See
  // docs/log/23-category-groups.md.
  groupId: string | null;
  // The caller's own "what happens when I log this" setting - a reminder, a cooldown, or a
  // stopwatch (see docs/log/39-category-timing.md). Null when unset, which is most of them.
  // Optional here rather than required because the admin endpoints return categories without it.
  timing?: { mode: "reminder" | "cooldown" | "stopwatch"; intervalMinutes: number | null } | null;
}

// The shape GET /api/category-groups returns - see backend/src/routes/categoryGroups.ts. Kept
// here, next to Category, since this form's own group picker (below) is the one place that needs
// it; SettingsPage.tsx's own management UI imports this same type rather than redeclaring it.
export interface CategoryGroup {
  id: string;
  userId: string | null;
  name: string;
  icon: string | null;
  hidden: boolean;
  createdAt: string;
}

const TYPE_OPTIONS: Array<{ value: Category["valueType"]; label: string; hint: string }> = [
  { value: "boolean", label: "Yes / No", hint: "e.g. Read today" },
  { value: "numeric", label: "Number", hint: "e.g. Glasses of water" },
  { value: "scale", label: "Scale", hint: "e.g. Energy level, 1-7" },
  { value: "duration", label: "Duration", hint: "e.g. Minutes meditated" },
];

interface CategoryCreateFormProps {
  onCreated: (category: Category) => void;
  onCancel: () => void;
  // "/api/categories" (a personal category) unless the admin page overrides it to
  // "/api/admin/categories" (a system-wide one) - same form, same validation, just a different
  // target endpoint, since the two routes accept an identical request shape (see
  // backend/src/routes/categories.ts and adminCategories.ts).
  createEndpoint?: string;
  // Groups the new category can be assigned to (already excludes hidden ones - a caller
  // shouldn't be steered toward putting a fresh category somewhere they've chosen not to see).
  // Defaults to none, in which case the picker below simply doesn't render (rather than showing
  // an empty, useless dropdown) - a caller that hasn't been updated to fetch groups yet still
  // works exactly as before.
  groups?: CategoryGroup[];
}

// A small, focused "define a category" form, supporting four value types (including "scale", a
// bounded picker generalizing what Mood and Symptom each used to do with their own separate fixed
// scale) - a former habit's three value types (boolean/numeric/duration) are a subset of these
// four, since Habit (and, separately, Symptom and Mood) unified into Category (see
// docs/log/17-unify-mood-symptom-habit.md). Defaults to a 1-7 range - every built-in scale
// category was standardized onto 1-7 (see docs/log/21-unify-scale-to-seven.md), so a brand-new
// custom one starts from the same house standard rather than an arbitrary 1-5.
export function CategoryCreateForm({
  onCreated,
  onCancel,
  createEndpoint = "/api/categories",
  groups = [],
}: CategoryCreateFormProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [type, setType] = useState<Category["valueType"] | null>(null);
  const [scaleMin, setScaleMin] = useState("1");
  const [scaleMax, setScaleMax] = useState("7");
  // "" means Uncategorized (sent as groupId: undefined, not a real group id) - a plain <select>
  // needs a string value for every option, including the "no real value" one.
  const [groupId, setGroupId] = useState("");
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
      const category = await apiFetch<Category>(createEndpoint, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          valueType: type,
          icon: icon.trim() || undefined,
          groupId: groupId || undefined,
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

      {groups.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="category-group-picker" className="text-sm font-medium text-text">
            Group (optional)
          </label>
          <select
            id="category-group-picker"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border border-border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <option value="">Uncategorized</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.icon ? `${group.icon} ` : ""}
                {group.name}
              </option>
            ))}
          </select>
        </div>
      )}

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

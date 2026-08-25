import { useId } from "react";

interface RatingScaleProps {
  label: string;
  values: number[];
  value: number | null;
  onChange: (value: number | null) => void;
  lowLabel: string;
  highLabel: string;
  // Grid layout with this many columns (e.g. a "scale" category's 1-10 range, 5 per row) instead
  // of the default single-row flex-wrap (e.g. a 7-value range like Energy/Stress, which fits on
  // one line).
  columns?: number;
  // Clicking an already-selected value clears it back to "not set" - not used by a "scale"
  // category's own value picker, which is always required and uses its own required-field error
  // message instead; left available for any future optional rating that needs it.
  clearable?: boolean;
  error?: string | null;
}

// The "row of selectable number buttons" pattern every "scale" category's own value picker uses -
// including every former symptom, and Mood/Energy/Stress themselves, now that Symptom and Mood
// both unified into Category (see docs/log/17-unify-mood-symptom-habit.md) and are just SCALE
// categories like any other. Previously three separate, near-identical implementations (the
// now-retired MoodEntryForm's own RatingRow, the now-retired SymptomEntryForm's inline severity
// fieldset, and a third copy HistoryEditModal used to carry before it was consolidated onto the
// shared entry forms - see the implementation log entry on that refactor). Pulled out here once,
// per the Phase 5 checklist's "RatingScale" reusable primitive, now that this exact shape has
// proven itself stable across independent forms rather than being guessed at up front.
export function RatingScale({
  label,
  values,
  value,
  onChange,
  lowLabel,
  highLabel,
  columns,
  clearable,
  error,
}: RatingScaleProps) {
  const descriptionId = useId();

  return (
    <fieldset>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div
        className={columns ? "mt-2 grid gap-2" : "mt-2 flex gap-2"}
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
      <p id={descriptionId} className="mt-1 text-xs text-text-muted">
        {values[0]} = {lowLabel} · {values[values.length - 1]} = {highLabel}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

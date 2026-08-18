// The three periods requirements §10 and Tasks.md Phase 10 call for, in the order they should
// read left-to-right (shortest first) - kept as a literal union, matching the backend's own
// `?period=7d|30d|90d` validation in trends.ts, so an invalid value simply can't be constructed
// on this side either.
export type TrendsPeriod = "7d" | "30d" | "90d";

const PERIOD_OPTIONS: { value: TrendsPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

interface PeriodSelectorProps {
  value: TrendsPeriod;
  onChange: (period: TrendsPeriod) => void;
}

// A `radiogroup` of plain buttons, the same accessible pattern already used for the mood-choice
// control in MoodEntryForm.tsx (`role="radiogroup"` + `role="radio"` + `aria-checked`) - "select
// exactly one of a small fixed set" is the same interaction shape in both places, so it gets the
// same markup rather than a native `<select>`, which would be harder to make large/tap-friendly
// per requirements §15.
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Trend period">
      {PERIOD_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              selected
                ? "border-brand bg-brand text-white"
                : "border-border bg-surface text-text hover:bg-surface-muted"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

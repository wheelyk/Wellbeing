interface DateTimeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

// A labeled `datetime-local` input - every entry form (Mood/Symptom/Medication/Habit) needs one
// identically, to let a backfilled entry's date/time be edited directly rather than always
// defaulting to "now." Satisfies the Phase 5 checklist's "DatePicker" reusable primitive: named
// DateTimeField rather than DatePicker since every real usage edits both the date and the time,
// never just the date - a native `<input type="datetime-local">` under the hood rather than a
// custom calendar widget, per this project's existing convention (see the implementation log
// entry on why this app never introduced its own date-picker UI for this).
export function DateTimeField({ id, value, onChange, label = "Date & time" }: DateTimeFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
    </div>
  );
}

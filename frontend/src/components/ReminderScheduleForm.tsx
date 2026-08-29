import { useState, type FormEvent } from "react";
import { Button } from "./Button";
import {
  DAY_INITIALS,
  DAY_LABELS,
  buildSchedules,
  daysForPreset,
  parseSchedules,
  presetForDays,
  type RepeatPreset,
  type ScheduleDraft,
} from "../lib/cronSchedule";

// The controls behind a category's bell. Presets cover almost every real case in one tap, day
// toggles handle the rest, and the raw cron sits behind a disclosure for anyone who wants it -
// same data, two views (see lib/cronSchedule.ts and
// docs/log/26-categories-page-and-reminder-picker.md).
//
// Deliberately dumb about the network: it owns the *draft* and hands finished cron expressions
// back to whoever rendered it. That keeps the round-trip logic testable without mocking fetch,
// and lets the same form serve a category reminder and the general one.

// The shape GET /api/reminders returns. Lives here rather than in the form it used to belong to
// (ReminderCreateForm, retired alongside fixed times - see
// docs/log/26-categories-page-and-reminder-picker.md) because this is now the component every
// reminder is edited through, whether it belongs to a category or is the general one.
export interface Reminder {
  id: string;
  userId: string;
  target: "general" | "category";
  categoryId: string | null;
  category: { name: string; icon: string | null } | null;
  schedules: string[];
  enabled: boolean;
  createdAt: string;
}

type RepeatOption = RepeatPreset | "hourly";

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
  { value: "hourly", label: "Every hour" },
  { value: "custom", label: "Custom" },
];

interface ReminderScheduleFormProps {
  // The reminder's current expressions, or [] when creating one.
  initialSchedules: string[];
  saving: boolean;
  error: string | null;
  onSave: (schedules: string[]) => void;
  // Omitted when there's no reminder yet - there's nothing to turn off.
  onTurnOff?: () => void;
  onCancel: () => void;
}

export function ReminderScheduleForm({
  initialSchedules,
  saving,
  error,
  onSave,
  onTurnOff,
  onCancel,
}: ReminderScheduleFormProps) {
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    initialSchedules.length > 0
      ? parseSchedules(initialSchedules)
      : { mode: "times", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], times: ["09:00"], expressions: [] },
  );
  // Opens itself for a schedule the simple controls can't represent, since in that case the raw
  // text is the only honest way to show what's actually stored.
  const [advancedOpen, setAdvancedOpen] = useState(draft.mode === "expression");
  const [expressionText, setExpressionText] = useState(initialSchedules.join("\n"));
  const [newTime, setNewTime] = useState("");

  const activeOption: RepeatOption =
    draft.mode === "hourly" ? "hourly" : presetForDays(draft.daysOfWeek);
  const generated = draft.mode === "expression" ? draft.expressions : buildSchedules(draft);

  function choosePreset(option: RepeatOption) {
    if (option === "hourly") {
      setDraft((prev) => ({ ...prev, mode: "hourly" }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      // Leaving hourly returns to the time list, keeping whatever times were there before.
      mode: "times",
      times: prev.times.length > 0 ? prev.times : ["09:00"],
      daysOfWeek: daysForPreset(option, prev.daysOfWeek),
    }));
  }

  function toggleDay(day: number) {
    setDraft((prev) => {
      const has = prev.daysOfWeek.includes(day);
      const next = has ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day];
      // Never allow an empty selection - it would save a schedule that can never fire.
      return {
        ...prev,
        daysOfWeek: next.length > 0 ? next.sort((a, b) => a - b) : prev.daysOfWeek,
      };
    });
  }

  function addTime() {
    if (!newTime || draft.times.includes(newTime)) return;
    setDraft((prev) => ({ ...prev, times: [...prev.times, newTime].sort() }));
    setNewTime("");
  }

  function removeTime(time: string) {
    setDraft((prev) => ({
      ...prev,
      // Same reasoning as the day toggles: a reminder with no times isn't a reminder.
      times: prev.times.length > 1 ? prev.times.filter((t) => t !== time) : prev.times,
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.mode === "expression") {
      const expressions = expressionText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      onSave(expressions);
      return;
    }
    onSave(buildSchedules(draft));
  }

  // Editing the raw text switches the form into expression mode and re-derives the simple
  // controls from it where possible, so typing "0 8 * * 1-5" lights the Weekdays chip back up.
  function handleExpressionChange(value: string) {
    setExpressionText(value);
    const expressions = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    setDraft(
      expressions.length > 0
        ? parseSchedules(expressions)
        : { ...draft, mode: "expression", expressions: [] },
    );
  }

  const showDayToggles = draft.mode !== "expression";
  const showTimes = draft.mode === "times";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Repeat</p>
        <div role="group" aria-label="Repeat" className="mt-2 flex flex-wrap gap-2">
          {REPEAT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={
                draft.mode !== "expression" && activeOption === option.value
                  ? "primary"
                  : "secondary"
              }
              aria-pressed={draft.mode !== "expression" && activeOption === option.value}
              onClick={() => choosePreset(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {showDayToggles && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            On these days
          </p>
          <div role="group" aria-label="Days of the week" className="mt-2 grid grid-cols-7 gap-1">
            {DAY_INITIALS.map((initial, day) => {
              const selected = draft.daysOfWeek.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={DAY_LABELS[day]}
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg border py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    selected
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-surface text-text-muted"
                  }`}
                >
                  {initial}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showTimes && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Times</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {draft.times.map((time) => (
              <span
                key={time}
                className="inline-flex items-center gap-1 rounded-lg border border-brand bg-brand/10 px-2 py-1 text-sm text-brand tabular-nums"
              >
                {time}
                {draft.times.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${time}`}
                    onClick={() => removeTime(time)}
                    className="font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="reminder-add-time" className="sr-only">
              Add a time
            </label>
            <input
              id="reminder-add-time"
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="rounded-lg border border-border px-2 py-1 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <Button type="button" variant="secondary" onClick={addTime} disabled={!newTime}>
              + Add time
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="text-sm text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {advancedOpen ? "▾" : "▸"} Advanced (cron)
        </button>
        {advancedOpen && (
          <div className="mt-2">
            <label htmlFor="reminder-cron" className="sr-only">
              Cron expressions
            </label>
            <textarea
              id="reminder-cron"
              value={draft.mode === "expression" ? expressionText : generated.join("\n")}
              onChange={(e) => handleExpressionChange(e.target.value)}
              rows={Math.max(2, generated.length)}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            {draft.mode === "expression" && (
              <p className="mt-1 text-xs text-text-muted">
                This schedule can&apos;t be shown as day and time controls, so it&apos;s kept
                exactly as written.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save reminder"}
        </Button>
        {onTurnOff && (
          <Button type="button" variant="secondary" onClick={onTurnOff} disabled={saving}>
            Turn off
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

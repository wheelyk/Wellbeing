import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "./Button";
import {
  DAY_INITIALS,
  DAY_LABELS,
  buildSchedules,
  daysForPreset,
  emptyRule,
  parseSchedules,
  presetForDays,
  type RepeatPreset,
  type ScheduleDraft,
  type ScheduleRule,
} from "../lib/cronSchedule";
import { describeNextRun, fetchNextRuns, type NextRunPreview } from "../lib/nextRunPreview";

// The controls behind a category's bell. Presets cover almost every real case in one tap, day
// toggles handle the rest, and the raw cron sits behind a disclosure for anyone who wants it -
// same data, two views (see lib/cronSchedule.ts and
// docs/log/26-categories-page-and-reminder-picker.md).
//
// A reminder can hold several rules, because "weekdays at 08:00 and weekends at 10:00" needs two
// sets of day toggles to say (see docs/log/27-multiple-schedules-per-reminder.md).
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

// Shortcuts for the day selection, nothing more - the day toggles below them are always visible
// and are the real control.
//
// Two chips have been removed over time, both for the same reason: they looked like modes but
// were not. "Custom" did nothing except keep the days already selected, and the toggles already
// show no chip selected when the days match no preset. "Every hour" combined with a day selection
// produced a rule nobody could read - day toggles on screen with no times under them - and hourly
// is better typed into the cron box, which is where a schedule firing 24 times a day belongs.
// See docs/log/36-picker-and-collapse-polish.md.
const REPEAT_OPTIONS: { value: RepeatPreset; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
];

// Mirrors the backend's own cap on stored expressions (see routes/reminders.ts) - a guard against
// a runaway list rather than a product opinion, but the UI should stop you before the API has to.
const MAX_RULES = 4;

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

// One rule's own controls. Split out so each rule's repeat chips, day toggles and time list are
// self-contained, and so adding a second rule is genuinely just another card.
function RuleFields({
  rule,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  rule: ScheduleRule;
  index: number;
  canRemove: boolean;
  onChange: (next: ScheduleRule) => void;
  onRemove: () => void;
}) {
  const [newTime, setNewTime] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const activeOption: RepeatPreset = presetForDays(rule.daysOfWeek);

  function choosePreset(option: RepeatPreset) {
    onChange({ ...rule, daysOfWeek: daysForPreset(option, rule.daysOfWeek) });
  }

  function toggleDay(day: number) {
    const has = rule.daysOfWeek.includes(day);
    const next = has ? rule.daysOfWeek.filter((d) => d !== day) : [...rule.daysOfWeek, day];
    // Never allow an empty selection - it would save a rule that can never fire.
    if (next.length === 0) return;
    onChange({ ...rule, daysOfWeek: next.sort((a, b) => a - b) });
  }

  // Opens the platform's own time picker straight from the "+" chip. There is no separate text
  // field and no confirm button: the picker's own Set/OK *is* the confirmation, which is one step
  // instead of three and removes the empty-input dead-end that made this feel broken when it was
  // reported from a real phone (see docs/log/29-fix-add-time-button.md and
  // docs/log/30-inline-time-picker.md).
  function openTimePicker() {
    const input = timeInputRef.current;
    if (!input) return;
    setTimeError(null);
    try {
      // Supported by every current mobile browser, and the only way to open the picker without
      // showing the input itself. Must be called from a user gesture, which this is.
      input.showPicker();
    } catch {
      // Older browsers, or a context that refuses showPicker - focusing the (rendered but
      // transparent) input still lets the native control be opened by the next tap.
      input.focus();
      input.click();
    }
  }

  // Fires when the native picker is confirmed, so the chosen time is added immediately - there is
  // nothing left for the user to press.
  function handleTimeChosen(value: string) {
    if (!value) return;

    if (rule.times.includes(value)) {
      setTimeError(`${value} is already on this schedule.`);
    } else {
      setTimeError(null);
      onChange({ ...rule, times: [...rule.times, value].sort() });
    }

    // Reset both React state and the DOM node - the element holds its own value independently, so
    // leaving it set would stop the picker reopening on the same time.
    setNewTime("");
    if (timeInputRef.current) timeInputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
          {index === 0 ? "Repeat" : `Also repeat`}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove schedule ${index + 1}`}
            className="text-sm text-text-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            ✕
          </button>
        )}
      </div>

      <div role="group" aria-label={`Repeat ${index + 1}`} className="mt-2 flex flex-wrap gap-2">
        {REPEAT_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={activeOption === option.value ? "primary" : "secondary"}
            aria-pressed={activeOption === option.value}
            onClick={() => choosePreset(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <p className="mt-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
        On these days
      </p>
      <div
        role="group"
        aria-label={`Days of the week ${index + 1}`}
        className="mt-2 grid grid-cols-7 gap-1"
      >
        {DAY_INITIALS.map((initial, day) => {
          const selected = rule.daysOfWeek.includes(day);
          return (
            <button
              key={day}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`${DAY_LABELS[day]} ${index + 1}`}
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

      <>
        <p className="mt-3 text-xs font-semibold tracking-wide text-text-muted uppercase">Times</p>
        {/* The times and the control that adds one sit on the same row: a set of chips, then a
              "+" chip built to match them. Tapping it opens the platform time picker directly, and
              that picker's own Set button is what commits - so there is no text field to fill in
              and no second button to press afterwards. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {rule.times.map((time) => (
            <span
              key={time}
              className="inline-flex items-center gap-1 rounded-lg border border-brand bg-brand/10 px-2 py-1 text-sm text-brand tabular-nums"
            >
              {time}
              {rule.times.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${time}`}
                  onClick={() => onChange({ ...rule, times: rule.times.filter((t) => t !== time) })}
                  className="font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  ✕
                </button>
              )}
            </span>
          ))}

          <span className="relative inline-flex">
            {/* Rendered, but transparent and behind the button: showPicker() needs a real
                  element to anchor its popup to, and keeping it exactly under the chip is what
                  makes the picker appear in the right place. pointer-events-none so every tap
                  reaches the button on top. */}
            {/* Hidden from assistive technology and out of the tab order on purpose: it is a
                  mechanism for opening the platform picker, not a control in its own right. The
                  button beside it is the thing that carries the accessible name, so exposing both
                  would announce the same action twice. */}
            <input
              ref={timeInputRef}
              id={`reminder-add-time-${index}`}
              type="time"
              value={newTime}
              onChange={(e) => handleTimeChosen(e.target.value)}
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            />
            <button
              type="button"
              onClick={openTimePicker}
              aria-label={`Add a time to schedule ${index + 1}`}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-sm text-text-muted transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true">🕐</span>
              <span aria-hidden="true" className="font-semibold">
                +
              </span>
            </button>
          </span>
        </div>
        {timeError && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {timeError}
          </p>
        )}
      </>
    </div>
  );
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
      : { mode: "rules", rules: [emptyRule()], expressions: [] },
  );
  // Opens itself for a schedule the simple controls can't represent, since in that case the raw
  // text is the only honest way to show what's actually stored.
  const [advancedOpen, setAdvancedOpen] = useState(draft.mode === "expression");
  const [expressionText, setExpressionText] = useState(initialSchedules.join("\n"));

  const generated = buildSchedules(draft);

  // Asked of the server rather than worked out here, deliberately - see lib/nextRunPreview.ts.
  // Keyed on the generated expressions so it re-runs whenever the schedule genuinely changes, and
  // not merely when the component re-renders.
  const [preview, setPreview] = useState<NextRunPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const scheduleKey = generated.join("\n");

  useEffect(() => {
    if (generated.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    // Debounced: tapping through day toggles changes the schedule several times in a second, and
    // every intermediate state would otherwise be a request whose answer is immediately stale.
    const timer = setTimeout(() => {
      fetchNextRuns(scheduleKey.split("\n"))
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setPreviewFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          // A rejected expression is an ordinary outcome while someone is mid-edit in the cron
          // box, so this stays quiet rather than shouting - the save path reports the real error.
          setPreview(null);
          setPreviewFailed(true);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // generated is rebuilt on every render; scheduleKey is its stable value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey]);

  function updateRule(index: number, next: ScheduleRule) {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? next : r)),
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (draft.mode === "expression") {
      onSave(
        expressionText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
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
        : { mode: "expression", rules: [], expressions: [] },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {draft.mode === "rules" && (
        <>
          {/* The rule cards and the control that adds one belong to the same stack, so the add
              control is shaped like an empty card in that stack rather than a loose button sitting
              on the form background - which is what made it read as unrelated to the cards above
              it. Dashed border marks it as an "add" affordance, matching the "+" time chip inside
              each card. */}
          <div className="flex flex-col gap-2">
            {draft.rules.map((rule, index) => (
              <RuleFields
                // Index is a legitimate key here: rules have no id, and the list is only ever
                // appended to or spliced, never reordered.
                key={index}
                rule={rule}
                index={index}
                canRemove={draft.rules.length > 1}
                onChange={(next) => updateRule(index, next)}
                onRemove={() =>
                  setDraft((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }))
                }
              />
            ))}
            {draft.rules.length < MAX_RULES && (
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({ ...prev, rules: [...prev.rules, emptyRule()] }))
                }
                className="w-full rounded-lg border border-dashed border-border bg-surface/50 p-3 text-sm font-medium text-text-muted transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                + Add another schedule
              </button>
            )}
          </div>
        </>
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

      {/* The whole point of this line: it is the server's answer, from the same cron code the
          scheduler runs, so a picker that draws one thing while the scheduler intends another
          becomes visible here instead of arriving as a notification on the wrong day. */}
      {preview && preview.nextRuns.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          <p className="text-text">
            Next:{" "}
            <span className="font-medium">{describeNextRun(preview.nextRuns[0], preview)}</span>
          </p>
          {preview.nextRuns.length > 1 && (
            <p className="mt-0.5 text-xs text-text-muted">
              then{" "}
              {preview.nextRuns
                .slice(1)
                .map((run) => describeNextRun(run, preview))
                .join(", ")}
            </p>
          )}
        </div>
      )}
      {preview && preview.nextRuns.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">
          This schedule has no upcoming runs in the next year.
        </p>
      )}
      {previewFailed && !error && (
        <p className="text-xs text-text-muted">Couldn&apos;t work out when this would next run.</p>
      )}

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

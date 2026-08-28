// Translates between the cron expressions the API stores (see backend/src/lib/cron.ts) and the
// controls a person actually operates: day chips, day toggles, and a list of times. See
// docs/log/26-categories-page-and-reminder-picker.md.
//
// The governing rule is that these are two *views of one value*, not two settings. The picker
// generates cron; cron is parsed back into the picker. When an expression can't be represented by
// the controls - a day-of-month rule, a step, anything hand-written - the UI falls back to showing
// the raw text rather than rewriting it into the nearest thing it understands. Silently
// "normalising" someone's schedule would be the same class of bug as an edit that looks saved but
// changes what was stored (see docs/LESSONS-LEARNED.md).

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// Single letters for the toggle row, which has to fit seven controls across a phone.
export const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

export type RepeatPreset = "daily" | "weekdays" | "weekends" | "custom";

export interface ScheduleDraft {
  // "times" - one or more specific times of day. "hourly" - on the hour, every hour.
  // "expression" - something the controls can't represent, kept exactly as written.
  mode: "times" | "hourly" | "expression";
  daysOfWeek: number[];
  times: string[];
  expressions: string[];
}

function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function presetForDays(daysOfWeek: number[]): RepeatPreset {
  const sorted = [...daysOfWeek].sort((x, y) => x - y);
  if (sameDays(sorted, ALL_DAYS)) return "daily";
  if (sameDays(sorted, WEEKDAYS)) return "weekdays";
  if (sameDays(sorted, WEEKENDS)) return "weekends";
  return "custom";
}

export function daysForPreset(preset: RepeatPreset, current: number[]): number[] {
  switch (preset) {
    case "daily":
      return [...ALL_DAYS];
    case "weekdays":
      return [...WEEKDAYS];
    case "weekends":
      return [...WEEKENDS];
    case "custom":
      // Keeps whatever was already selected, so switching to Custom to adjust one day doesn't
      // wipe the rest. Falls back to every day rather than none, since a schedule with no days
      // selected would never fire at all.
      return current.length > 0 ? [...current] : [...ALL_DAYS];
  }
}

// The day-of-week field, written the way a person would: `*` for every day, and the readable
// range/list forms for the common cases rather than an exhaustive comma list.
function dayFieldFor(daysOfWeek: number[]): string {
  const sorted = [...daysOfWeek].sort((x, y) => x - y);
  if (sameDays(sorted, ALL_DAYS)) return "*";
  if (sameDays(sorted, WEEKDAYS)) return "1-5";
  return sorted.join(",");
}

// The picker's state, rendered as the cron the API stores. One expression per time, because a
// single expression can only carry several times when they share a minute (see the backend's
// schema comment on Reminder.schedules).
export function buildSchedules(draft: ScheduleDraft): string[] {
  if (draft.mode === "expression") return draft.expressions;

  const dayField = dayFieldFor(draft.daysOfWeek);
  if (draft.mode === "hourly") return [`0 * * * ${dayField}`];

  return draft.times.map((time) => {
    const [hour, minute] = time.split(":");
    return `${Number(minute)} ${Number(hour)} * * ${dayField}`;
  });
}

function parseDayField(field: string): number[] | null {
  if (field === "*") return [...ALL_DAYS];
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const range = /^(\d)-(\d)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) return null;
      for (let d = from; d <= to; d += 1) days.add(d);
      continue;
    }
    if (!/^\d$/.test(part)) return null;
    days.add(Number(part));
  }
  const sorted = [...days].sort((x, y) => x - y);
  return sorted.every((d) => d >= 0 && d <= 6) ? sorted : null;
}

// The inverse of buildSchedules. Returns an "expression" draft whenever the stored value is
// anything the controls can't faithfully round-trip - which is a normal outcome, not a failure.
export function parseSchedules(schedules: string[]): ScheduleDraft {
  const asExpression: ScheduleDraft = {
    mode: "expression",
    daysOfWeek: [...ALL_DAYS],
    times: [],
    expressions: schedules,
  };

  if (schedules.length === 0) return asExpression;

  let dayField: string | null = null;
  let hourly = false;
  const times: string[] = [];

  for (const expression of schedules) {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) return asExpression;
    const [minute, hour, dom, month, dow] = fields;

    // Anything narrowing the date beyond day-of-week is outside what the controls offer.
    if (dom !== "*" || month !== "*") return asExpression;
    if (parseDayField(dow) === null) return asExpression;

    // Every expression in one reminder has to agree on which days it runs, or the single row of
    // day toggles would be lying about at least one of them.
    if (dayField === null) dayField = dow;
    else if (dayField !== dow) return asExpression;

    if (hour === "*") {
      // Only "on the hour" maps onto the hourly control; `30 * * * *` is valid but has no place
      // to show its minute, so it stays an expression.
      if (minute !== "0" || schedules.length !== 1) return asExpression;
      hourly = true;
      continue;
    }

    if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return asExpression;
    const h = Number(hour);
    const m = Number(minute);
    if (h > 23 || m > 59) return asExpression;
    times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  const daysOfWeek = parseDayField(dayField as string) as number[];
  if (hourly) return { mode: "hourly", daysOfWeek, times: [], expressions: schedules };
  return { mode: "times", daysOfWeek, times, expressions: schedules };
}

function describeDays(daysOfWeek: number[]): string {
  const preset = presetForDays(daysOfWeek);
  if (preset === "daily") return "daily";
  if (preset === "weekdays") return "weekdays";
  if (preset === "weekends") return "weekends";
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(", ");
}

// The one-line summary shown under a category's name, so a whole group can be scanned without
// opening anything. Deliberately plain English - a row of raw cron would tell most people
// nothing.
export function describeSchedules(schedules: string[]): string {
  const draft = parseSchedules(schedules);

  if (draft.mode === "expression") {
    return schedules.length === 1 ? "Custom schedule" : `${schedules.length} custom schedules`;
  }
  if (draft.mode === "hourly") return `Every hour, ${describeDays(draft.daysOfWeek)}`;

  const times = [...draft.times].sort().join(", ");
  return `${times} ${describeDays(draft.daysOfWeek)}`;
}

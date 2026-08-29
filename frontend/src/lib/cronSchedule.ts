// Translates between the cron expressions the API stores (see backend/src/lib/cron.ts) and the
// controls a person actually operates: day chips, day toggles, and a list of times. See
// docs/log/26-categories-page-and-reminder-picker.md and
// docs/log/27-multiple-schedules-per-reminder.md.
//
// The governing rule is that these are two *views of one value*, not two settings. The picker
// generates cron; cron is parsed back into the picker. When an expression can't be represented by
// the controls - a day-of-month rule, a step, anything hand-written - the UI falls back to showing
// the raw text rather than rewriting it into the nearest thing it understands. Silently
// "normalising" someone's schedule would be the same class of bug as an edit that looks saved but
// changes what was stored (see docs/LESSONS-LEARNED.md).
//
// A reminder holds a *list* of rules, not one. "Weekdays at 08:00, and weekends at 10:00" is an
// ordinary thing to want, and it needs two rules because a single row of day toggles can't say two
// different things at once. Each rule flattens to one cron expression per time, so the stored
// `schedules` array is the concatenation of every rule's expressions.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// Single letters for the toggle row, which has to fit seven controls across a phone.
export const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

export type RepeatPreset = "daily" | "weekdays" | "weekends" | "custom";

// One "rule": a set of days, and either specific times on those days or every hour.
export interface ScheduleRule {
  mode: "times" | "hourly";
  daysOfWeek: number[];
  times: string[];
}

export interface ScheduleDraft {
  // "rules" - representable by the controls. "expression" - something they can't draw, kept
  // exactly as written.
  mode: "rules" | "expression";
  rules: ScheduleRule[];
  expressions: string[];
}

export function emptyRule(): ScheduleRule {
  return { mode: "times", daysOfWeek: [...ALL_DAYS], times: ["09:00"] };
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
      // wipe the rest. Falls back to every day rather than none, since a rule with no days
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

function ruleToExpressions(rule: ScheduleRule): string[] {
  const dayField = dayFieldFor(rule.daysOfWeek);
  if (rule.mode === "hourly") return [`0 * * * ${dayField}`];
  return rule.times.map((time) => {
    const [hour, minute] = time.split(":");
    return `${Number(minute)} ${Number(hour)} * * ${dayField}`;
  });
}

// The picker's state, rendered as the cron the API stores. One expression per time, because a
// single expression can only carry several times when they share a minute (see the backend's
// schema comment on Reminder.schedules).
export function buildSchedules(draft: ScheduleDraft): string[] {
  if (draft.mode === "expression") return draft.expressions;
  // Deduped: two rules can legitimately overlap (say "every day at 09:00" plus "Mondays at
  // 09:00"), and the same expression stored twice would be a wasted round trip at best.
  return [...new Set(draft.rules.flatMap(ruleToExpressions))];
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

// The inverse of buildSchedules. Expressions are grouped into rules by the days they run on,
// since that is exactly what one set of day toggles can describe. Returns an "expression" draft
// whenever any part of the stored value can't be faithfully round-tripped - a normal outcome for
// a hand-written schedule, not a failure.
export function parseSchedules(schedules: string[]): ScheduleDraft {
  const asExpression: ScheduleDraft = { mode: "expression", rules: [], expressions: schedules };
  if (schedules.length === 0) return asExpression;

  // Keyed by the raw day field so expressions written the same way group together, and ordered by
  // first appearance so the rules read back in the order they were created.
  const order: string[] = [];
  const byDayField = new Map<string, { hourly: boolean; times: string[] }>();

  for (const expression of schedules) {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) return asExpression;
    const [minute, hour, dom, month, dow] = fields;

    // Anything narrowing the date beyond day-of-week is outside what the controls offer.
    if (dom !== "*" || month !== "*") return asExpression;
    if (parseDayField(dow) === null) return asExpression;

    if (!byDayField.has(dow)) {
      order.push(dow);
      byDayField.set(dow, { hourly: false, times: [] });
    }
    const group = byDayField.get(dow) as { hourly: boolean; times: string[] };

    if (hour === "*") {
      // Only "on the hour" maps onto the hourly control; `30 * * * *` is valid but has nowhere to
      // show its minute. An hourly rule also can't share its day set with specific times - one
      // rule's controls would have to show both at once.
      if (minute !== "0" || group.times.length > 0 || group.hourly) return asExpression;
      group.hourly = true;
      continue;
    }
    if (group.hourly) return asExpression;

    if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return asExpression;
    const h = Number(hour);
    const m = Number(minute);
    if (h > 23 || m > 59) return asExpression;
    group.times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  const rules: ScheduleRule[] = order.map((dayField) => {
    const group = byDayField.get(dayField) as { hourly: boolean; times: string[] };
    return {
      mode: group.hourly ? "hourly" : "times",
      daysOfWeek: parseDayField(dayField) as number[],
      times: group.times,
    };
  });

  return { mode: "rules", rules, expressions: schedules };
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

export function describeRule(rule: ScheduleRule): string {
  if (rule.mode === "hourly") return `Every hour, ${describeDays(rule.daysOfWeek)}`;
  return `${[...rule.times].sort().join(", ")} ${describeDays(rule.daysOfWeek)}`;
}

// The one-line summary shown under a category's name, so a whole group can be scanned without
// opening anything. Deliberately plain English - a row of raw cron would tell most people
// nothing. Several rules are joined with a middot, which stays readable at the size this renders.
export function describeSchedules(schedules: string[]): string {
  const draft = parseSchedules(schedules);
  if (draft.mode === "expression") {
    return schedules.length === 1 ? "Custom schedule" : `${schedules.length} custom schedules`;
  }
  return draft.rules.map(describeRule).join(" · ");
}

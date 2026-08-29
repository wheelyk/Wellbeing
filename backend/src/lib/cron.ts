import { addDaysToDateStr, currentTimeInTimezone, dayOfWeek, todayInTimezone } from "./timezone";

// A small, hand-written cron parser rather than a dependency - the same call this project already
// made for timezone.ts ("Node's built-in Intl can do this correctly without adding a dependency,
// so this module is a small hand-written wrapper"). The deciding factor here is the *shape* this
// app actually needs, which no cron library offers directly: not "when does this next fire" but
// "which HH:mm slots does this expression produce on this specific local calendar date."
//
// That shape is what keeps the scheduler change small. Once an expression is expanded into the
// same "HH:mm" strings Reminder.times used to hold literally, every piece of machinery downstream
// - the ReminderSend idempotency key, shouldSendReminder's own at-or-after comparison - keeps
// working unchanged. See docs/log/25-cron-reminder-schedules.md.

// Standard five-field cron: minute hour day-of-month month day-of-week.
const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 6 },
] as const;

// An expression like `* * * * *` is syntactically fine but would produce 1440 slots in a day -
// 1440 push notifications, 1440 ReminderSend rows, for a reminder nobody wants. Capped well below
// that: 48 allows every 30 minutes, which is already finer than the scheduler's own 5-minute tick
// can meaningfully distinguish, and leaves hourly (24 slots) comfortable room. Rejected at the API
// boundary with a clear message rather than silently truncated.
export const MAX_SLOTS_PER_EXPRESSION = 48;

export class CronParseError extends Error {}

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  // Whether the day-of-month / day-of-week fields were narrowed at all (i.e. not a bare `*`).
  // Needed because of cron's genuinely surprising OR rule - see cronMatchesDate below.
  domRestricted: boolean;
  dowRestricted: boolean;
}

// Expands one field's spec into the explicit list of values it matches. Supports the syntax
// people actually write: `*`, `*/15`, `5`, `1-5`, `1-5/2`, and comma-separated lists of any of
// those. Deliberately does *not* support names (`MON`, `JAN`) or the non-standard `?`/`L`/`W`/`#`
// extensions - anything unrecognised is rejected outright rather than guessed at, since a
// misread schedule fires on the wrong day rather than failing visibly.
function parseField(spec: string, min: number, max: number, name: string): number[] {
  const values = new Set<number>();

  for (const part of spec.split(",")) {
    if (part === "") throw new CronParseError(`Empty value in the ${name} field`);

    const [rangePart, stepPart, ...extra] = part.split("/");
    if (extra.length > 0)
      throw new CronParseError(`Malformed step in the ${name} field: "${part}"`);

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) {
        throw new CronParseError(`Step must be a whole number in the ${name} field: "${part}"`);
      }
      step = Number(stepPart);
      if (step < 1) throw new CronParseError(`Step must be at least 1 in the ${name} field`);
    }

    let from: number;
    let to: number;

    if (rangePart === "*") {
      from = min;
      to = max;
    } else if (/^\d+$/.test(rangePart)) {
      from = Number(rangePart);
      // A bare number with a step (`5/10`) means "from 5 to the end of the range, every 10" -
      // matching how real cron implementations read it.
      to = stepPart === undefined ? from : max;
    } else {
      const match = /^(\d+)-(\d+)$/.exec(rangePart);
      if (!match) throw new CronParseError(`Unrecognised value in the ${name} field: "${part}"`);
      from = Number(match[1]);
      to = Number(match[2]);
      if (from > to) throw new CronParseError(`Range is backwards in the ${name} field: "${part}"`);
    }

    if (from < min || to > max) {
      throw new CronParseError(`The ${name} field must be between ${min} and ${max}`);
    }

    for (let value = from; value <= to; value += step) values.add(value);
  }

  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): ParsedCron {
  const specs = expression.trim().split(/\s+/);
  if (specs.length !== 5) {
    throw new CronParseError(
      "A schedule needs exactly 5 fields: minute hour day-of-month month day-of-week",
    );
  }

  // 7 is an accepted alias for Sunday in most cron implementations, and someone hand-writing an
  // expression may well use it. Normalised to 0 before parsing so the rest of this module only
  // ever deals with JS's own 0-6 convention (matching timezone.ts's dayOfWeek).
  const dowSpec = specs[4].replace(/\b7\b/g, "0");

  const [minutes, hours, daysOfMonth, months] = FIELDS.slice(0, 4).map((field, i) =>
    parseField(specs[i], field.min, field.max, field.name),
  );
  const daysOfWeek = parseField(dowSpec, 0, 6, "day of week");

  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: specs[2] !== "*",
    dowRestricted: specs[4] !== "*",
  };
}

// Whether this expression fires at all on the given "YYYY-MM-DD" local calendar date.
//
// The day-of-month / day-of-week interaction is cron's most surprising rule, and getting it wrong
// is exactly the "fires on the wrong day" bug worth guarding against: when *both* fields are
// narrowed, they're OR'd, not AND'd. `0 9 1 * 1` means "the 1st of the month, and also every
// Monday" - not "Mondays that fall on the 1st." When only one is narrowed, that one simply has to
// match.
export function cronMatchesDate(parsed: ParsedCron, dateStr: string): boolean {
  const month = Number(dateStr.slice(5, 7));
  const dom = Number(dateStr.slice(8, 10));
  const dow = dayOfWeek(dateStr);

  if (!parsed.months.includes(month)) return false;

  const domMatches = parsed.daysOfMonth.includes(dom);
  const dowMatches = parsed.daysOfWeek.includes(dow);

  if (parsed.domRestricted && parsed.dowRestricted) return domMatches || dowMatches;
  if (parsed.domRestricted) return domMatches;
  if (parsed.dowRestricted) return dowMatches;
  return true;
}

// The one function the scheduler actually calls: every "HH:mm" slot this expression produces on
// the given local date, ascending. Empty when the expression doesn't fire that day at all.
export function cronSlotsForDate(expression: string, dateStr: string): string[] {
  const parsed = parseCron(expression);
  if (!cronMatchesDate(parsed, dateStr)) return [];

  const slots: string[] = [];
  for (const hour of parsed.hours) {
    for (const minute of parsed.minutes) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots.sort();
}

// Validation used at the API boundary (see routes/reminders.ts). Returns the reason it's invalid,
// or null when it's fine - a message rather than a bare boolean so the caller can tell the user
// *what* is wrong with their expression rather than just that something is.
export function cronValidationError(expression: string): string | null {
  let parsed: ParsedCron;
  try {
    parsed = parseCron(expression);
  } catch (err) {
    return err instanceof CronParseError ? err.message : "Invalid schedule";
  }

  // Checked against the widest possible day rather than a specific date, since the slot count per
  // firing day doesn't depend on which day it is - only the hour and minute fields drive it.
  const slotsPerDay = parsed.hours.length * parsed.minutes.length;
  if (slotsPerDay > MAX_SLOTS_PER_EXPRESSION) {
    return `That schedule would fire ${slotsPerDay} times a day; at most ${MAX_SLOTS_PER_EXPRESSION} are allowed`;
  }

  return null;
}

export interface NextRun {
  // Local to the user's own timezone, not UTC and not the server's - the same frame of reference
  // the scheduler itself works in (see reminderScheduler.ts).
  date: string;
  time: string;
}

// How far ahead to look before giving up. A monthly rule only needs ~31 days, but a
// month-restricted one (`0 9 * 12 *` evaluated in January) can legitimately be almost a year out,
// so the window covers a full year plus a day for leap years. Each day is a cheap in-memory
// expansion, and the scan stops as soon as enough runs are found - which for almost every real
// schedule is on the first or second day.
const MAX_LOOKAHEAD_DAYS = 366;

// The next few times these schedules will actually fire, computed with the same parser and the
// same day-by-day expansion the scheduler uses to decide what to send. That shared implementation
// is the entire point: a preview derived from separate logic could agree with the user's
// expectation while still disagreeing with what the scheduler will really do.
// See docs/log/33-next-run-preview.md.
export function nextRunsForSchedules(schedules: string[], timeZone: string, count = 3): NextRun[] {
  const today = todayInTimezone(timeZone);
  const nowLocalTime = currentTimeInTimezone(timeZone);
  const runs: NextRun[] = [];

  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS && runs.length < count; offset += 1) {
    const date = addDaysToDateStr(today, offset);

    const slots = new Set<string>();
    for (const expression of schedules) {
      try {
        for (const slot of cronSlotsForDate(expression, date)) slots.add(slot);
      } catch {
        // A stored expression that no longer parses is skipped rather than thrown, exactly as the
        // scheduler skips it - a preview should never be the thing that breaks the page.
      }
    }

    for (const time of [...slots].sort()) {
      // Strictly future: a slot at the current minute has either just fired or is about to, so
      // calling it the "next" run would be misleading either way.
      if (offset === 0 && time <= nowLocalTime) continue;
      runs.push({ date, time });
      if (runs.length === count) break;
    }
  }

  return runs;
}

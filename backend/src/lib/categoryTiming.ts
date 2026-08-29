import type {
  CategoryTimingMode as PrismaCategoryTimingMode,
  CategoryValueType as PrismaCategoryValueType,
} from "../generated/prisma/client";

// The API speaks lowercase, the database speaks SCREAMING_CASE - the same split (and the same two
// tiny mapping functions) that categoryValueType.ts and reminderTarget.ts already establish. Kept
// as a real translation rather than leaking the Prisma enum outward, so a stored value can be
// renamed without changing the public contract.
export const API_CATEGORY_TIMING_MODES = ["reminder", "cooldown", "stopwatch"] as const;
export type ApiCategoryTimingMode = (typeof API_CATEGORY_TIMING_MODES)[number];

const TO_PRISMA: Record<ApiCategoryTimingMode, PrismaCategoryTimingMode> = {
  reminder: "REMINDER",
  cooldown: "COOLDOWN",
  stopwatch: "STOPWATCH",
};

const TO_API: Record<PrismaCategoryTimingMode, ApiCategoryTimingMode> = {
  REMINDER: "reminder",
  COOLDOWN: "cooldown",
  STOPWATCH: "stopwatch",
};

export function toPrismaTimingMode(mode: ApiCategoryTimingMode): PrismaCategoryTimingMode {
  return TO_PRISMA[mode];
}

export function toApiTimingMode(mode: PrismaCategoryTimingMode): ApiCategoryTimingMode {
  return TO_API[mode];
}

export function serializeTiming<T extends { mode: PrismaCategoryTimingMode }>(
  timing: T,
): Omit<T, "mode"> & { mode: ApiCategoryTimingMode } {
  return { ...timing, mode: toApiTimingMode(timing.mode) };
}

// A follow-up reminder's own bounds (see routes/reminders.ts): the floor sits above the
// scheduler's five-minute tick, the ceiling is where "again in a bit" stops meaning anything.
// Matched deliberately, because a REMINDER interval is exactly what gets offered to that endpoint.
const MIN_REMINDER_MINUTES = 15;
const MAX_REMINDER_MINUTES = 12 * 60;

// A cooldown is allowed to be longer, and to be shorter, because it schedules nothing: it is a
// countdown drawn on screen from the last log, so it is bounded only by what a person could
// plausibly mean. A day is the ceiling; beyond that a "gap since last time" stops being a timer
// and starts being a habit, which is what a reminder is for.
const MIN_COOLDOWN_MINUTES = 5;
const MAX_COOLDOWN_MINUTES = 24 * 60;

// Which intervals each mode accepts, and which categories a stopwatch makes sense on. Returns the
// message rather than throwing, so the caller can attach it to the field it belongs to.
//
// Deliberately a named function rather than a pile of zod refinements: the rule is genuinely
// three-way and depends on the *category* as well as the request, which a schema can't see.
export function timingIntervalError(
  mode: ApiCategoryTimingMode,
  intervalMinutes: number | null,
  valueType: PrismaCategoryValueType,
): string | null {
  if (mode === "stopwatch") {
    // A stopwatch produces the value being logged, so it only means anything where that value is a
    // duration. Offering it on a 1-7 scale would be measuring something with nowhere to put it.
    if (valueType !== "DURATION") {
      return "A stopwatch only works on a category measured in minutes";
    }
    if (intervalMinutes !== null) {
      return "A stopwatch measures how long something took; it has no interval to set";
    }
    return null;
  }

  if (mode === "cooldown") {
    // The gap *is* the setting - a cooldown without one has nothing to count down.
    if (intervalMinutes === null) return "Choose how long the gap should be";
    if (intervalMinutes < MIN_COOLDOWN_MINUTES || intervalMinutes > MAX_COOLDOWN_MINUTES) {
      return `A gap must be between ${MIN_COOLDOWN_MINUTES} minutes and ${MAX_COOLDOWN_MINUTES / 60} hours`;
    }
    return null;
  }

  // reminder: optional, since "offer me the usual choices and I'll pick each time" is a perfectly
  // good answer - but if one is given it has to be one the follow-up endpoint would accept.
  if (intervalMinutes === null) return null;
  if (intervalMinutes < MIN_REMINDER_MINUTES || intervalMinutes > MAX_REMINDER_MINUTES) {
    return `A reminder interval must be between ${MIN_REMINDER_MINUTES} minutes and ${MAX_REMINDER_MINUTES / 60} hours`;
  }
  return null;
}

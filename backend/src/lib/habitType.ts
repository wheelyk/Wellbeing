import { HabitType as PrismaHabitType } from "../generated/prisma/client";

// The database's HabitType enum (Prisma convention: SCREAMING_CASE - BOOLEAN/NUMERIC/DURATION)
// is kept separate from the JSON API's representation (lowercase - boolean/numeric/duration,
// matching the exact wording used in Tasks.md/requirements.md and reading more naturally as a
// TypeScript string-literal union on the frontend). This module is the one place that
// translates between the two, so every route only ever deals with the lowercase API shape.
export const API_HABIT_TYPES = ["boolean", "numeric", "duration"] as const;
export type ApiHabitType = (typeof API_HABIT_TYPES)[number];

const API_TO_PRISMA: Record<ApiHabitType, PrismaHabitType> = {
  boolean: PrismaHabitType.BOOLEAN,
  numeric: PrismaHabitType.NUMERIC,
  duration: PrismaHabitType.DURATION,
};

const PRISMA_TO_API: Record<PrismaHabitType, ApiHabitType> = {
  [PrismaHabitType.BOOLEAN]: "boolean",
  [PrismaHabitType.NUMERIC]: "numeric",
  [PrismaHabitType.DURATION]: "duration",
};

export function toPrismaHabitType(type: ApiHabitType): PrismaHabitType {
  return API_TO_PRISMA[type];
}

export function toApiHabitType(type: PrismaHabitType): ApiHabitType {
  return PRISMA_TO_API[type];
}

// Shapes a raw Prisma Habit row (whose `type` field is the SCREAMING_CASE enum) into the JSON
// the API actually returns (lowercase `type`), without callers needing to remember to convert
// it themselves at every response site.
export function serializeHabit<T extends { type: PrismaHabitType }>(
  habit: T,
): Omit<T, "type"> & { type: ApiHabitType } {
  return { ...habit, type: toApiHabitType(habit.type) };
}

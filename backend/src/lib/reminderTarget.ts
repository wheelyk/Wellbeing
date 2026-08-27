import { ReminderTarget as PrismaReminderTarget } from "../generated/prisma/client";

// Same lowercase-API-vs-SCREAMING_CASE-database split as lib/categoryValueType.ts, for the same
// reason - this is the one place that translates between them, so every route only ever deals
// with the lowercase API shape.
//
// "mood" (Phase 17) and "medication" (Phase 19) were both removed once Mood and Medication
// unified into Category - a reminder about either is a "category" reminder now, like any other
// category's. Both migrations remapped (not dropped) any existing reminder, since each had an
// unambiguous single destination category - see docs/log/17-unify-mood-symptom-habit.md and
// docs/log/19-medication-to-category.md.
export const API_REMINDER_TARGETS = ["general", "category"] as const;
export type ApiReminderTarget = (typeof API_REMINDER_TARGETS)[number];

const API_TO_PRISMA: Record<ApiReminderTarget, PrismaReminderTarget> = {
  general: PrismaReminderTarget.GENERAL,
  category: PrismaReminderTarget.CATEGORY,
};

const PRISMA_TO_API: Record<PrismaReminderTarget, ApiReminderTarget> = {
  [PrismaReminderTarget.GENERAL]: "general",
  [PrismaReminderTarget.CATEGORY]: "category",
};

export function toPrismaReminderTarget(target: ApiReminderTarget): PrismaReminderTarget {
  return API_TO_PRISMA[target];
}

export function toApiReminderTarget(target: PrismaReminderTarget): ApiReminderTarget {
  return PRISMA_TO_API[target];
}

// Targets that are always category-level (at most one reminder per user for each) - the
// opposite of MEDICATION/CATEGORY, which always require a specific medicationId/categoryId.
export const CATEGORY_LEVEL_TARGETS: ReadonlySet<ApiReminderTarget> = new Set(["general"]);

import { ReminderTarget as PrismaReminderTarget } from "../generated/prisma/client";

// Same lowercase-API-vs-SCREAMING_CASE-database split as lib/categoryValueType.ts, for the same
// reason - this is the one place that translates between them, so every route only ever deals
// with the lowercase API shape.
//
// "mood" was removed once Mood unified into Category (Phase 17, see
// docs/log/17-unify-mood-symptom-habit.md) - a reminder about Mood is a "category" reminder now,
// like any other category's, pointing at the new system Mood category. An existing MOOD-target
// reminder was remapped (not dropped) by that same migration, since there was always exactly one
// unambiguous destination category for it.
export const API_REMINDER_TARGETS = ["general", "medication", "category"] as const;
export type ApiReminderTarget = (typeof API_REMINDER_TARGETS)[number];

const API_TO_PRISMA: Record<ApiReminderTarget, PrismaReminderTarget> = {
  general: PrismaReminderTarget.GENERAL,
  medication: PrismaReminderTarget.MEDICATION,
  category: PrismaReminderTarget.CATEGORY,
};

const PRISMA_TO_API: Record<PrismaReminderTarget, ApiReminderTarget> = {
  [PrismaReminderTarget.GENERAL]: "general",
  [PrismaReminderTarget.MEDICATION]: "medication",
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

import { CategoryValueType as PrismaCategoryValueType } from "../generated/prisma/client";

// Same lowercase-API-vs-SCREAMING_CASE-database split as lib/habitType.ts, for the same reason -
// this is the one place that translates between them, so every route only ever deals with the
// lowercase API shape.
export const API_CATEGORY_VALUE_TYPES = ["boolean", "numeric", "scale", "duration"] as const;
export type ApiCategoryValueType = (typeof API_CATEGORY_VALUE_TYPES)[number];

const API_TO_PRISMA: Record<ApiCategoryValueType, PrismaCategoryValueType> = {
  boolean: PrismaCategoryValueType.BOOLEAN,
  numeric: PrismaCategoryValueType.NUMERIC,
  scale: PrismaCategoryValueType.SCALE,
  duration: PrismaCategoryValueType.DURATION,
};

const PRISMA_TO_API: Record<PrismaCategoryValueType, ApiCategoryValueType> = {
  [PrismaCategoryValueType.BOOLEAN]: "boolean",
  [PrismaCategoryValueType.NUMERIC]: "numeric",
  [PrismaCategoryValueType.SCALE]: "scale",
  [PrismaCategoryValueType.DURATION]: "duration",
};

export function toPrismaCategoryValueType(type: ApiCategoryValueType): PrismaCategoryValueType {
  return API_TO_PRISMA[type];
}

export function toApiCategoryValueType(type: PrismaCategoryValueType): ApiCategoryValueType {
  return PRISMA_TO_API[type];
}

// Shapes a raw Prisma Category row (SCREAMING_CASE valueType) into the JSON the API actually
// returns (lowercase valueType) - mirrors habitType.ts's serializeHabit.
export function serializeCategory<T extends { valueType: PrismaCategoryValueType }>(
  category: T,
): Omit<T, "valueType"> & { valueType: ApiCategoryValueType } {
  return { ...category, valueType: toApiCategoryValueType(category.valueType) };
}

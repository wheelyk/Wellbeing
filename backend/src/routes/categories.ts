import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  API_CATEGORY_VALUE_TYPES,
  serializeCategory,
  toPrismaCategoryValueType,
} from "../lib/categoryValueType";

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    icon: z.string().trim().min(1).max(8).optional(),
    valueType: z.enum(API_CATEGORY_VALUE_TYPES),
    scaleMin: z.number().int().optional(),
    scaleMax: z.number().int().optional(),
  })
  .refine(
    (data) =>
      data.valueType !== "scale" ||
      (data.scaleMin !== undefined && data.scaleMax !== undefined && data.scaleMin < data.scaleMax),
    {
      message:
        "scaleMin and scaleMax are required for a scale category, and scaleMin must be less than scaleMax",
      path: ["scaleMin"],
    },
  );

// name/icon are editable; valueType (and therefore scaleMin/scaleMax) is not - same reasoning as
// Habit's own immutable `type`: an existing log's value column is only meaningful in light of
// the type it was logged under.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).max(8).optional().nullable(),
});

export const categoriesRouter = Router();

// System categories (userId null, created only via /api/admin/categories) plus the caller's own
// custom ones - the same combined-list read Symptom's own GET /api/symptoms already does.
categoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    orderBy: { name: "asc" },
  });
  res.json(categories.map(serializeCategory));
});

categoriesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid category",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { name, icon, valueType, scaleMin, scaleMax } = parsed.data;
  // Always creates with the caller's own userId - a regular user can never create a system
  // category through this route, only through /api/admin/categories (requireAdmin-gated).
  const category = await prisma.category.create({
    data: {
      userId: req.userId as string,
      name,
      icon,
      valueType: toPrismaCategoryValueType(valueType),
      scaleMin: valueType === "scale" ? scaleMin : null,
      scaleMax: valueType === "scale" ? scaleMax : null,
    },
  });

  res.status(201).json(serializeCategory(category));
});

categoriesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid category",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // Scoped to userId (never matches a system category, whose userId is null, or another user's)
  // so both "doesn't exist" and "exists but isn't yours to edit" come back as the same
  // undifferentiated 404 - identical to how symptoms.ts already protects system symptoms.
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  res.json(serializeCategory(category));
});

categoriesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  // Archiving, not deleting - see schema.prisma's Category.archivedAt comment for why. A repeat
  // archive of an already-archived category is a harmless no-op, not an error.
  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });

  // Any reminder targeting this category is disabled, not deleted, alongside it - a Reminder's
  // own relation to Category is Restrict (see schema.prisma), not Cascade, precisely because
  // archiving (never a real delete) would otherwise leave it silently still "enabled" and trying
  // to fire against a category that no longer accepts new logs.
  await prisma.reminder.updateMany({
    where: { categoryId: category.id },
    data: { enabled: false },
  });

  res.status(200).json(serializeCategory(category));
});

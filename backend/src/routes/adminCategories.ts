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
    description: z.string().trim().min(1).max(2000).optional(),
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

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).max(8).optional().nullable(),
  description: z.string().trim().min(1).max(2000).optional().nullable(),
});

// Every route here is already gated by requireAuth + requireAdmin at the app.ts mount point -
// these handlers only ever run for the one hardcoded admin account, and only ever operate on
// system-wide (userId: null) categories, never a regular user's personal one.
export const adminCategoriesRouter = Router();

adminCategoriesRouter.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { userId: null },
    orderBy: { name: "asc" },
  });
  res.json(categories.map(serializeCategory));
});

adminCategoriesRouter.post("/", async (req, res) => {
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

  const { name, icon, description, valueType, scaleMin, scaleMax } = parsed.data;
  // userId left unset (null) - this is precisely what makes a category system-wide/built-in for
  // every user, mirroring Symptom's own system-symptom convention.
  const category = await prisma.category.create({
    data: {
      name,
      icon,
      description,
      valueType: toPrismaCategoryValueType(valueType),
      scaleMin: valueType === "scale" ? scaleMin : null,
      scaleMax: valueType === "scale" ? scaleMax : null,
    },
  });

  res.status(201).json(serializeCategory(category));
});

adminCategoriesRouter.patch("/:id", async (req, res) => {
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

  // Scoped to userId: null - an admin manages system categories here, never a regular user's
  // personal one (those stay exclusively under /api/categories).
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
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

adminCategoriesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });

  // Any reminder targeting this category - belonging to any user, since a system category can
  // have many users' own reminders pointed at it - is disabled, not deleted, alongside it. Same
  // reasoning as categories.ts's own archive route: Reminder.category is Restrict, not Cascade,
  // so this is what actually stops a now-archived category's reminders from still trying to fire.
  await prisma.reminder.updateMany({
    where: { categoryId: category.id },
    data: { enabled: false },
  });

  res.status(200).json(serializeCategory(category));
});

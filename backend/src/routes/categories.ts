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

// name/icon/description are editable; valueType (and therefore scaleMin/scaleMax) is not - same
// reasoning as Habit's own immutable `type`: an existing log's value column is only meaningful in
// light of the type it was logged under.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).max(8).optional().nullable(),
  description: z.string().trim().min(1).max(2000).optional().nullable(),
});

export const categoriesRouter = Router();

// System categories (userId null, created only via /api/admin/categories) plus the caller's own
// custom ones - the same combined-list read Symptom's own GET /api/symptoms already does.
//
// Excludes categories the caller has hidden (see POST/DELETE /:id/hide below) by default - this
// is the view Dashboard/Quick Add use, where a hidden category should genuinely disappear.
// ?includeHidden=true keeps them in, each serialized with its own `hidden: boolean` - this is the
// view Settings' management list uses instead, since a management screen needs to show a hidden
// category (with an Unhide action) rather than making it vanish with no way back.
//
// `lastLoggedAt` (this caller's own most recent log against each category, or null) is what
// Dashboard uses to decide which categories get their own "Recent <name>" card at all (Phase 18) -
// a category with no logs yet from this specific caller gets no card, however many other users
// (for a system category) or nobody at all may have logged it. Computed via one `groupBy` query
// rather than a per-category subquery, so this stays a fixed two-query cost regardless of how
// many categories exist.
categoriesRouter.get("/", async (req, res) => {
  const includeHidden = req.query.includeHidden === "true";
  const [categories, lastLoggedRows] = await Promise.all([
    prisma.category.findMany({
      where: {
        archivedAt: null,
        OR: [{ userId: null }, { userId: req.userId }],
        ...(includeHidden ? {} : { hiddenBy: { none: { userId: req.userId } } }),
      },
      orderBy: { name: "asc" },
      include: { hiddenBy: { where: { userId: req.userId }, select: { id: true } } },
    }),
    prisma.categoryLog.groupBy({
      by: ["categoryId"],
      where: { userId: req.userId },
      _max: { loggedAt: true },
    }),
  ]);

  const lastLoggedAtByCategoryId = new Map(
    lastLoggedRows.map((row) => [row.categoryId, row._max.loggedAt]),
  );

  res.json(
    categories.map(({ hiddenBy, ...category }) => ({
      ...serializeCategory(category),
      hidden: hiddenBy.length > 0,
      lastLoggedAt: lastLoggedAtByCategoryId.get(category.id)?.toISOString() ?? null,
    })),
  );
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

  const { name, icon, description, valueType, scaleMin, scaleMax } = parsed.data;
  // Always creates with the caller's own userId - a regular user can never create a system
  // category through this route, only through /api/admin/categories (requireAdmin-gated).
  const category = await prisma.category.create({
    data: {
      userId: req.userId as string,
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

// Hides a system category (one the caller didn't create and can't archive) from this caller's own
// GET / results - a personal category has no need for this at all, since archiving already does
// the job for something the caller actually owns.
categoriesRouter.post("/:id/hide", async (req, res) => {
  const category = await prisma.category.findFirst({
    where: { id: req.params.id, userId: null, archivedAt: null },
  });
  if (!category) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  // Re-hiding an already-hidden category is a harmless no-op, not an error - upsert on the
  // (userId, categoryId) unique constraint rather than checking existence first.
  await prisma.hiddenCategory.upsert({
    where: { userId_categoryId: { userId: req.userId as string, categoryId: category.id } },
    create: { userId: req.userId as string, categoryId: category.id },
    update: {},
  });

  res.status(200).json({ message: "Category hidden" });
});

categoriesRouter.delete("/:id/hide", async (req, res) => {
  // No existence/ownership check needed beyond scoping the delete to this caller's own
  // preference row - deleting a preference that was never there (or already removed) is a
  // harmless no-op, matching this route's own POST above.
  await prisma.hiddenCategory.deleteMany({
    where: { categoryId: req.params.id, userId: req.userId },
  });

  res.status(200).json({ message: "Category unhidden" });
});

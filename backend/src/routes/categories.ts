import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  API_CATEGORY_VALUE_TYPES,
  serializeCategory,
  toPrismaCategoryValueType,
} from "../lib/categoryValueType";
import { purgeEligibleAt } from "../lib/categoryPurge";

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    icon: z.string().trim().min(1).max(8).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    valueType: z.enum(API_CATEGORY_VALUE_TYPES),
    scaleMin: z.number().int().optional(),
    scaleMax: z.number().int().optional(),
    // Optional - see schema.prisma's Category.groupId comment for why a category with no group is
    // a normal, supported state ("Uncategorized" in the UI), not an error.
    groupId: z.string().trim().min(1).optional(),
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

// name/icon/description/groupId are editable; valueType (and therefore scaleMin/scaleMax) is not -
// same reasoning as Habit's own immutable `type`: an existing log's value column is only
// meaningful in light of the type it was logged under. groupId accepts an explicit `null` (unlike
// createSchema's own optional-but-not-nullable version) so moving a category back to
// "Uncategorized" is possible, not just moving it between two real groups.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).max(8).optional().nullable(),
  description: z.string().trim().min(1).max(2000).optional().nullable(),
  groupId: z.string().trim().min(1).optional().nullable(),
});

// ID-tampering defense - the same pattern reminders.ts's own categoryId handling already uses:
// scope the lookup by ownership/visibility before ever trusting an id in the request body, so a
// category can never end up "in" a group its owner can't actually see (another user's private
// one). Returns true for `undefined`/`null` (nothing to check) or a group the caller can see;
// false otherwise.
async function isGroupIdValid(
  groupId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (groupId === undefined || groupId === null) return true;
  const group = await prisma.categoryGroup.findFirst({
    where: { id: groupId, OR: [{ userId: null }, { userId }] },
  });
  return group !== null;
}

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

// The caller's own soft-deleted (archived) personal categories - never a system category, which
// only an admin can archive (see adminCategories.ts) and which this list has no opinion about.
// This is the "Deleted categories" section's own fetch: listing what DELETE /:id below produced,
// and what POST /:id/restore below can undo. Includes `purgeEligibleAt` (when the 30-day grace
// period this project settled on ends) and `hasLogs`, so the frontend can tell "will be
// permanently removed on this date" apart from "kept indefinitely, since it still has history" -
// see the background purge job (categoryPurgeScheduler.ts) for what actually enforces that.
categoriesRouter.get("/deleted", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { userId: req.userId, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
  });

  const logCounts = await prisma.categoryLog.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: categories.map((c) => c.id) } },
    _count: { _all: true },
  });
  const logCountByCategoryId = new Map(logCounts.map((row) => [row.categoryId, row._count._all]));

  res.json(
    categories.map((category) => ({
      ...serializeCategory(category),
      purgeEligibleAt: purgeEligibleAt(category.archivedAt as Date).toISOString(),
      hasLogs: (logCountByCategoryId.get(category.id) ?? 0) > 0,
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

  const { name, icon, description, valueType, scaleMin, scaleMax, groupId } = parsed.data;

  if (!(await isGroupIdValid(groupId, req.userId as string))) {
    return res.status(404).json({
      error: { message: "Group not found", code: "GROUP_NOT_FOUND" },
    });
  }

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
      groupId,
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

  if (!(await isGroupIdValid(parsed.data.groupId, req.userId as string))) {
    return res.status(404).json({
      error: { message: "Group not found", code: "GROUP_NOT_FOUND" },
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

  // Soft-deletes, not a real (hard) delete - see schema.prisma's Category.archivedAt comment for
  // why. A repeat delete of an already-deleted category is a harmless no-op, not an error (its
  // 30-day grace period restarts from this moment, which is fine - nothing currently exposes a
  // way to delete an already-deleted category anyway, since GET / stops returning it the instant
  // this first runs). categoryPurgeScheduler.ts is what actually removes it for real, and only
  // once it's sat archived for 30 days *and* has no logs against it - a category with real logged
  // history is kept indefinitely rather than ever being silently erased. Until then (or until
  // POST /:id/restore below undoes this), it behaves exactly like today's Archive already did:
  // hidden from active use, but fully intact.
  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
  });

  // Any reminder targeting this category is disabled, not deleted, alongside it - a Reminder's
  // own relation to Category is Restrict (see schema.prisma), not Cascade, precisely because
  // soft-deleting (not yet a real delete) would otherwise leave it silently still "enabled" and
  // trying to fire against a category that no longer accepts new logs. Deliberately left disabled
  // on restore too (see POST /:id/restore) rather than automatically re-enabled - see that
  // route's own comment.
  await prisma.reminder.updateMany({
    where: { categoryId: category.id },
    data: { enabled: false },
  });

  res.status(200).json(serializeCategory(category));
});

// Undoes DELETE /:id above, within its 30-day grace period - after that, categoryPurgeScheduler.ts
// may have already removed the category for real (only if it had no logs; see that file), in
// which case this 404s the same as any other category that doesn't exist.
categoriesRouter.post("/:id/restore", async (req, res) => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, userId: req.userId, archivedAt: { not: null } },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
    });
  }

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { archivedAt: null },
  });

  // Deliberately does NOT re-enable any reminder DELETE /:id disabled above - restoring a
  // category the caller had chosen to delete shouldn't silently start sending them notifications
  // again without their say-so. They can re-enable a specific reminder themselves from Settings if
  // they still want it.
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

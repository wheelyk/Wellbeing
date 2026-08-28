import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1),
  icon: z.string().trim().min(1).max(8).optional(),
});

// icon accepts an explicit `null` here (unlike createSchema's) so clearing a previously-set icon
// during an edit actually clears it - the same "not provided" vs. "explicitly cleared" distinction
// categories.ts's own updateSchema already draws for the identical reason.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1).max(8).optional().nullable(),
});

export const categoryGroupsRouter = Router();

// System groups (userId null, seeded directly - see the category_groups migration) plus the
// caller's own custom ones. Excludes any group the caller has hidden by default, the same
// includeHidden=true convention categories.ts already established - the default view is what
// Settings' grouped category list and any future picker use; the management view (Settings' own
// "manage groups" list) needs hidden ones included too, with a Hide/Unhide action, or hiding would
// be a one-way trip with no way back.
//
// Ordered by createdAt only, oldest first - deliberately not `orderBy: userId` to put system
// groups first: Postgres sorts NULL last in ascending order by default, which would push every
// system group (userId: null) *after* every personal one, the opposite of what's wanted. Callers
// that need system-before-personal partition this response client-side instead (see
// SettingsPage.tsx's own CategoriesSection) - createdAt ascending is what keeps the 6 seeded
// built-in groups in their original, intentional order (Medicine, Symptom, Mind & Mood, Activity,
// Drink, Food) within that partition.
categoryGroupsRouter.get("/", async (req, res) => {
  const includeHidden = req.query.includeHidden === "true";
  const groups = await prisma.categoryGroup.findMany({
    where: {
      OR: [{ userId: null }, { userId: req.userId }],
      ...(includeHidden ? {} : { hiddenBy: { none: { userId: req.userId } } }),
    },
    orderBy: { createdAt: "asc" },
    include: { hiddenBy: { where: { userId: req.userId }, select: { id: true } } },
  });

  res.json(
    groups.map(({ hiddenBy, ...group }) => ({
      ...group,
      hidden: hiddenBy.length > 0,
    })),
  );
});

categoryGroupsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid group",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // Always creates with the caller's own userId - a regular user can never create a system group
  // through this route (there's no admin equivalent yet either - see this task's own docs/log
  // entry for why that's deliberately out of scope for now).
  const group = await prisma.categoryGroup.create({
    data: { userId: req.userId as string, name: parsed.data.name, icon: parsed.data.icon },
  });

  res.status(201).json(group);
});

categoryGroupsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid group",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // Scoped to userId (never matches a system group, whose userId is null, or another user's) so
  // both "doesn't exist" and "exists but isn't yours to rename" come back as the same
  // undifferentiated 404 - identical to how categories.ts already protects system categories.
  const existing = await prisma.categoryGroup.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Group not found", code: "GROUP_NOT_FOUND" },
    });
  }

  const group = await prisma.categoryGroup.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  res.json(group);
});

// Hides any group visible to the caller - built-in or their own - from this caller's own GET /
// results. Deliberately not scoped to userId: null the way categories.ts's own hide route is: a
// group can't be deleted yet (see this task's own docs/log entry), so hiding is currently the
// only way for a user to get a regretted custom group out of view, not just a built-in one.
categoryGroupsRouter.post("/:id/hide", async (req, res) => {
  const group = await prisma.categoryGroup.findFirst({
    where: { id: req.params.id, OR: [{ userId: null }, { userId: req.userId }] },
  });
  if (!group) {
    return res.status(404).json({
      error: { message: "Group not found", code: "GROUP_NOT_FOUND" },
    });
  }

  // Re-hiding an already-hidden group is a harmless no-op, not an error - upsert on the
  // (userId, groupId) unique constraint rather than checking existence first, the same pattern
  // categories.ts's own hide route already uses.
  await prisma.hiddenGroup.upsert({
    where: { userId_groupId: { userId: req.userId as string, groupId: group.id } },
    create: { userId: req.userId as string, groupId: group.id },
    update: {},
  });

  res.status(200).json({ message: "Group hidden" });
});

categoryGroupsRouter.delete("/:id/hide", async (req, res) => {
  // No existence/ownership check needed beyond scoping the delete to this caller's own preference
  // row - deleting a preference that was never there (or already removed) is a harmless no-op,
  // matching this route's own POST above.
  await prisma.hiddenGroup.deleteMany({
    where: { groupId: req.params.id, userId: req.userId },
  });

  res.status(200).json({ message: "Group unhidden" });
});

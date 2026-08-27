import { Router } from "express";
import { prisma } from "../lib/prisma";
import { serializeCategory } from "../lib/categoryValueType";

export const exportRouter = Router();

// GET /api/export - lets a user download everything they've ever logged (plus the category
// definitions those logs reference) as a single JSON file. Every query below is scoped to
// req.userId, the same ownership boundary every other route in this app enforces (see
// dashboard.ts/history.ts) - nothing here is a system-wide export.
//
// System-default categories (userId null, see schema.prisma) are deliberately excluded from the
// `categories` definitions list below, since they aren't something this user created or owns -
// the same distinction categories.ts's own GET / route makes between "mine" and "everyone's." Any
// log entry that references one still carries its name inline (categoryName below), so the
// export is still self-contained without pulling in definitions belonging to no one.
exportRouter.get("/", async (req, res) => {
  const userId = req.userId as string;

  const [user, categories, categoryLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, timezone: true, createdAt: true },
    }),
    // Personal categories only (userId set) - this is also where every former habit's,
    // symptom's, and medication's own definition now lives, since all three unified into Category
    // (see docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md).
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.categoryLog.findMany({
      where: { userId },
      orderBy: { loggedAt: "asc" },
      include: { category: { select: { name: true } } },
    }),
  ]);

  // Same "user row could have been deleted since the access token was issued" case dashboard.ts
  // and users.ts's GET /me both already guard against - a genuine 404, not an auth failure.
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  const exportedAt = new Date();
  // YYYY-MM-DD, for the suggested filename only - a human-scannable label on the download,
  // never parsed or read back, so the per-user-timezone "what day is it really" question that
  // matters elsewhere in this app (see lib/timezone.ts) doesn't apply here.
  const filenameDate = exportedAt.toISOString().slice(0, 10);

  const body = {
    exportedAt: exportedAt.toISOString(),
    user,
    categories: categories.map(serializeCategory),
    categoryLogs: categoryLogs.map(({ category, ...log }) => ({
      ...log,
      categoryName: category.name,
    })),
  };

  // Content-Disposition: attachment is what turns this from "browser navigates to and renders
  // raw JSON" into "browser downloads a file" - the filename here is only ever a *suggestion*
  // the browser is free to rename on save, not something read back by anything server-side.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="welltrack-export-${filenameDate}.json"`,
  );
  // Content-Disposition isn't one of the small set of headers a cross-origin fetch() response
  // exposes to JS by default (the "CORS-safelisted response headers" - Content-Type etc., but
  // not this one) - without explicitly opting it in here, frontend/api/client.ts's own
  // apiFetchFile would find res.headers.get("Content-Disposition") silently null in this app's
  // real deployed setup (frontend and backend on different origins/ports), and ExportDataSection
  // would fall back to its own generic filename, quietly losing the date suffix. Caught by
  // actually driving this through a real cross-origin browser session (see this task's PR
  // description) rather than trusting the vitest/supertest suite, which talks to the app
  // in-process and never exercises real cross-origin header-visibility rules at all.
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.json(body);
});

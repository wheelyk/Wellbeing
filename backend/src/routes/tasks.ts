import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  addDaysToDateStr,
  formatDateInTimezone,
  getDayRangeUtc,
  timeInTimezone,
  todayInTimezone,
} from "../lib/timezone";
import type { Task as PrismaTask } from "../generated/prisma/client";

// A one-off "phone the vet" thing to do, at a specific moment - deliberately not a Category (see
// schema.prisma's own comment on Task). This route is the read side that feeds Timeline
// (docs/log/51-one-off-tasks.md); taskScheduler.ts is the write side that actually delivers the
// due-time push notification.

const createSchema = z.object({
  title: z.string().trim().min(1, "A title is required"),
  notes: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime({ message: "dueAt must be a valid ISO datetime" }),
});

// notes accepts an explicit `null` (clearing a previously-set note) the same way every other
// edit schema in this codebase does - see categoryLogs.ts's own updateSchema for the identical
// reasoning. dueAt, if provided, reschedules; done, if provided, marks or reopens.
const updateSchema = z.object({
  title: z.string().trim().min(1, "A title is required").optional(),
  notes: z.string().trim().min(1).optional().nullable(),
  dueAt: z.string().datetime({ message: "dueAt must be a valid ISO datetime" }).optional(),
  done: z.boolean().optional(),
});

// The same three choices Timeline's own range chips offer for reminders (TIMELINE_RANGES in the
// frontend's lib/timeline.ts) - one shared value drives every source Timeline merges, not a
// second range convention that happens to agree with the first one today.
const DAY_OPTIONS = ["1", "3", "7"] as const;
const daysSchema = z.enum(DAY_OPTIONS).default("1").transform(Number);

// A generous defensive cap, not a real product limit - guards against a runaway request the way
// routes/reminders.ts's own MAX_UPCOMING_RUNS does, for an account with an implausible number of
// live one-off tasks.
const MAX_TASKS = 500;

type TaskState = "upcoming" | "overdue" | "done";

function stateOf(task: { dueAt: Date; doneAt: Date | null }, now: Date): TaskState {
  if (task.doneAt !== null) return "done";
  return task.dueAt <= now ? "overdue" : "upcoming";
}

// The one shape every route below actually hands back - GET's own list used to be the only place
// this was computed; POST and PATCH returned the bare Prisma row instead (no `state`, no `date`/
// `time`, no `when`), which silently broke the very first caller that trusted its own return type
// (TaskManager.tsx's toggleDone genuinely read `.state` off a PATCH response to decide which toast
// to show - found by running it in a real browser, not by any unit test, since the test's own
// mock had quietly fabricated the field the real API never sent). One function now, used by every
// route that returns a task, so `ApiTask` on the frontend is honest everywhere, not patched around
// at one call site.
function serializeTask(task: PrismaTask, timezone: string, now: Date) {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    // Resolved into the account's own timezone here, once - the same "the server always knows
    // which calendar day/time this is, the client never re-derives it" rule every other date in
    // this app already follows (see lib/timeline.ts's own dayLabel comment).
    date: formatDateInTimezone(task.dueAt, timezone),
    time: timeInTimezone(task.dueAt, timezone),
    dueAt: task.dueAt.toISOString(),
    state: stateOf(task, now),
    // Which side of the NOW divider this task's own row belongs on, on Timeline - the identical
    // comparison "overdue" already makes, resolved once here rather than re-derived from the row's
    // own dueAt against a live client clock (see lib/timeline.ts's own comment on why that
    // discipline matters: two implementations of "has this already happened" can disagree by the
    // time either one actually runs).
    when: task.dueAt <= now ? "past" : "future",
  };
}

// Every write route needs the same two things GET already resolves: the caller's own timezone
// (to answer `date`/`time` honestly) and a 404 if the caller's own token outlived their account
// (the same "genuine 404, not a silently-wrong default" rule dashboard.ts/history.ts/trends.ts/
// users.ts already apply - see history.ts's own comment on why this is checked unconditionally,
// not only when a timezone-sensitive field is actually requested).
async function requireUserTimezone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? null;
}

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res) => {
  const parsedDays = daysSchema.safeParse(req.query.days);
  if (!parsedDays.success) {
    return res.status(400).json({
      error: {
        message: "Invalid range",
        code: "VALIDATION_ERROR",
        details: { days: [`days must be one of ${DAY_OPTIONS.join(", ")}`] },
      },
    });
  }
  const days = parsedDays.data;

  const timezone = await requireUserTimezone(req.userId as string);
  if (timezone === null) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }
  const today = todayInTimezone(timezone);
  const now = new Date();

  // Same "2N-1 calendar days, today shared" window Timeline's own /recent+/upcoming pair already
  // reads `days` as - see lib/timeline.ts's TIMELINE_RANGES comment. A task has no separate
  // past/future endpoint the way a reminder does (nothing to expand, nothing to check against a
  // logged target), so one query covers both halves directly.
  const windowStart = getDayRangeUtc(addDaysToDateStr(today, -(days - 1)), timezone).start;
  const windowEnd = getDayRangeUtc(addDaysToDateStr(today, days - 1), timezone).end;

  const tasks = await prisma.task.findMany({
    where: { userId: req.userId, dueAt: { gte: windowStart, lt: windowEnd } },
    orderBy: { dueAt: "asc" },
    take: MAX_TASKS,
  });

  res.json({
    timezone,
    today,
    tasks: tasks.map((task) => serializeTask(task, timezone, now)),
  });
});

tasksRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid task",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const timezone = await requireUserTimezone(req.userId as string);
  if (timezone === null) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  const { title, notes, dueAt } = parsed.data;

  const task = await prisma.task.create({
    data: { userId: req.userId as string, title, notes, dueAt: new Date(dueAt) },
  });

  res.status(201).json(serializeTask(task, timezone, new Date()));
});

tasksRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid task",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) {
    return res.status(404).json({ error: { message: "Task not found", code: "TASK_NOT_FOUND" } });
  }

  const timezone = await requireUserTimezone(req.userId as string);
  if (timezone === null) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  const { title, notes, dueAt, done } = parsed.data;

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(notes !== undefined ? { notes } : {}),
      // Rescheduling clears notifiedAt unconditionally, not just when the new time is later - a
      // task moved earlier (e.g. "actually I need this done by lunch") should be able to notify
      // again at its new time too, the same as one moved later. taskScheduler.ts only ever needs
      // to know "has the *current* dueAt already been notified about", and this is what keeps
      // that true across a reschedule rather than silently going quiet for the rest of this
      // task's life.
      ...(dueAt !== undefined ? { dueAt: new Date(dueAt), notifiedAt: null } : {}),
      ...(done !== undefined ? { doneAt: done ? new Date() : null } : {}),
    },
  });

  res.json(serializeTask(task, timezone, new Date()));
});

tasksRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) {
    return res.status(404).json({ error: { message: "Task not found", code: "TASK_NOT_FOUND" } });
  }

  // A real, hard delete - unlike Category, nothing else in the schema references a Task (no
  // CategoryLog-shaped child row whose own history a delete would otherwise orphan), so there is
  // no soft-delete/undo window to protect the way categories.ts's own DELETE needs one.
  await prisma.task.delete({ where: { id: existing.id } });

  res.status(200).json({ message: "Deleted" });
});

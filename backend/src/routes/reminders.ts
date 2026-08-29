import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { ReminderTarget as PrismaReminderTarget } from "../generated/prisma/client";
import {
  API_REMINDER_TARGETS,
  toApiReminderTarget,
  toPrismaReminderTarget,
} from "../lib/reminderTarget";
import { cronValidationError, nextRunsForSchedules } from "../lib/cron";
import {
  addDaysToDateStr,
  currentTimeInTimezone,
  getDayRangeUtc,
  todayInTimezone,
} from "../lib/timezone";

// A generous cap, not a real limit anyone should hit - guards against a runaway request rather
// than a genuine product constraint (see routes/categories.ts's icon length cap for the same kind
// of defensive-not-restrictive bound). This bounds the number of *expressions*; cron.ts's own
// MAX_SLOTS_PER_EXPRESSION separately bounds how often any single one of them may fire.
//
// Raised from 6 once the picker gained multiple schedule rules per reminder (see
// docs/log/27-multiple-schedules-per-reminder.md): rules multiply expressions, so a UI cap of
// four rules with a few times each needs more headroom than a single rule ever did.
const MAX_SCHEDULES = 12;

// Enough to show the shape of a schedule (a two-rule weekday/weekend pattern needs more than one
// to be recognisable) without turning a confirmation line into a list.
const PREVIEW_RUN_COUNT = 3;

const schedulesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "A schedule can't be empty")
      // Validated with the same parser the scheduler itself uses (see lib/cron.ts), so anything
      // accepted here is guaranteed to be something the scheduler can expand later - there is
      // deliberately no second, looser notion of "valid" anywhere. The parser's own message is
      // surfaced rather than a generic "invalid schedule", so the user is told which field is
      // wrong and why.
      .superRefine((expression, ctx) => {
        const error = cronValidationError(expression);
        if (error) ctx.addIssue({ code: "custom", message: error });
      }),
  )
  .min(1, "At least one schedule is required")
  .max(MAX_SCHEDULES, `At most ${MAX_SCHEDULES} schedules are allowed`)
  // Deduped, but deliberately *not* sorted - unlike the times[] this replaced. Sorting "HH:mm"
  // strings happened to produce chronological order, which is why the old schema did it; sorting
  // cron expressions lexicographically produces nothing meaningful ("0 15 * * *" lands before
  // "0 9 * * *"), so it would reorder the user's list for no benefit. Input order is preserved
  // instead, so what someone entered is the order they see when they come back.
  .transform((schedules) => [...new Set(schedules)]);

// How far ahead an expiry may be set. A temporary reminder is meant to be temporary - "for the
// rest of today", or a course of treatment measured in days. A date years away is far more likely
// to be a broken client-side calculation than a real intention, and unlike a bad schedule (which
// is visible in the list and easy to fix) a bad expiry is invisible until the day it silently
// stops - or doesn't.
const MAX_EXPIRY_DAYS = 31;
const MAX_EXPIRY_MS = MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// "end-of-day" is accepted as a literal rather than making the client send the instant, because
// the client would have to compute it in the user's *stored* timezone to be right - not the
// browser's. Those are usually the same and occasionally aren't (someone travelling, a phone left
// on the wrong region), and "quietly fires for an extra hour, once in a while" is exactly the
// class of bug that never gets reported and never gets found. The scheduler resolves reminders
// against the stored timezone, so the expiry is resolved against it too, here, where it is
// already in hand.
const expiresAtSchema = z.union([
  z.literal("end-of-day"),
  z.string().datetime({ message: 'Expiry must be an ISO 8601 timestamp, or "end-of-day"' }),
]);

type ResolvedExpiry = { expiresAt: Date } | { error: string };

function resolveExpiresAt(value: string, timezone: string): ResolvedExpiry {
  if (value === "end-of-day") {
    // getDayRangeUtc's `end` is the *exclusive* end of the local day - midnight tonight, as an
    // absolute instant. Reused rather than reimplemented so there is only one answer in this
    // codebase to "when does this user's day end", and it's the one the scheduler already uses.
    return { expiresAt: getDayRangeUtc(todayInTimezone(timezone), timezone).end };
  }

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return { error: "Expiry isn't a real date" };

  const now = Date.now();
  // An expiry already in the past would create a reminder that has never fired and never can -
  // rejected outright rather than accepted and silently swept away an hour later.
  if (expiresAt.getTime() <= now) return { error: "Expiry must be in the future" };
  if (expiresAt.getTime() > now + MAX_EXPIRY_MS) {
    return { error: `Expiry can be at most ${MAX_EXPIRY_DAYS} days from now` };
  }
  return { expiresAt };
}

async function userTimezone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? null;
}

const createSchema = z
  .object({
    target: z.enum(API_REMINDER_TARGETS),
    categoryId: z.string().trim().min(1).optional(),
    schedules: schedulesSchema,
    // Absent (or null) means an ordinary standing reminder, which is every reminder that existed
    // before this field did.
    expiresAt: expiresAtSchema.nullable().optional(),
    // Defaults true at the database level - "nudge me until I do it", how every reminder has always
    // behaved. False is "nudge me on a rhythm": keep firing on schedule whether or not it's been
    // logged.
    stopsWhenLogged: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.target === "category") return !!data.categoryId;
      return !data.categoryId;
    },
    {
      message:
        'categoryId is required for target "category"; it is not allowed for any other target',
      path: ["target"],
    },
  );

// target/medicationId/categoryId are deliberately not part of this schema - immutable after
// creation, the same reasoning as Habit.type: what a reminder is *about* isn't something that
// makes sense to change after the fact, only whether it's on and when it fires.
const updateSchema = z
  .object({
    schedules: schedulesSchema.optional(),
    enabled: z.boolean().optional(),
    // Explicit null is a genuinely different value from "not provided" here: null means "stop
    // being temporary and become an ordinary standing reminder", where omitting the field means
    // "leave the expiry exactly as it is". This is the distinction docs/LESSONS-LEARNED.md was
    // written about - it only ever bites on edit, never on create - so both cases are covered by
    // their own test below.
    expiresAt: expiresAtSchema.nullable().optional(),
    // No null case here, unlike expiresAt: a boolean column that is never null has no third state
    // to express, so "not provided" is the only absence there is.
    stopsWhenLogged: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const REMINDER_INCLUDE = {
  category: { select: { name: true, icon: true } },
} as const;

// Shapes a raw Prisma Reminder row (SCREAMING_CASE target, plus the joined category) into the
// JSON the API actually returns - mirrors habitType.ts's serializeHabit/categoryValueType.ts's
// serializeCategory.
function serializeReminder<
  T extends {
    target: PrismaReminderTarget;
    category: { name: string; icon: string | null } | null;
  },
>(reminder: T): Omit<T, "target"> & { target: string } {
  return { ...reminder, target: toApiReminderTarget(reminder.target) };
}

export const remindersRouter = Router();

remindersRouter.get("/", async (req, res) => {
  const reminders = await prisma.reminder.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: REMINDER_INCLUDE,
  });
  res.json(reminders.map(serializeReminder));
});

// "When would this actually fire?", answered for a schedule the caller hasn't saved yet.
//
// Deliberately computed here rather than in the browser, even though the frontend has its own cron
// code capable of it. That frontend implementation exists to *draw* the picker; this one is what
// the scheduler genuinely uses to decide what to send. A preview derived from the drawing code
// could agree with the user's expectation while still disagreeing with what will really happen -
// which is precisely the failure this endpoint exists to make visible. See
// docs/log/33-next-run-preview.md.
//
// Declared before the "/:id" routes below purely for readability; POST "/preview" and POST "/" are
// already unambiguous to Express.
remindersRouter.post("/preview", async (req, res) => {
  const parsed = z.object({ schedules: schedulesSchema }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid schedule",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // The scheduler resolves every reminder against the owner's stored timezone, so a preview that
  // used the server's - or the browser's - would be answering a different question.
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { timezone: true },
  });
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  // "today" travels with the response so the client never has to work out what day it is in the
  // user timezone - it only has to compare date strings, which has no clock in it at all.
  const today = todayInTimezone(user.timezone);
  res.json({
    timezone: user.timezone,
    today,
    tomorrow: addDaysToDateStr(today, 1),
    nextRuns: nextRunsForSchedules(parsed.data.schedules, user.timezone, PREVIEW_RUN_COUNT),
  });
});

// How far out a follow-up may be asked for. The floor keeps it above the scheduler's own five
// minute tick (anything shorter would be a promise the scheduler can't keep); the ceiling is the
// point at which "again in a bit" stops being a follow-up to something you just did.
const MIN_FOLLOW_UP_MINUTES = 15;
const MAX_FOLLOW_UP_MINUTES = 12 * 60;

const followUpSchema = z
  .object({
    target: z.enum(API_REMINDER_TARGETS),
    categoryId: z.string().trim().min(1).optional(),
    inMinutes: z.number().int().min(MIN_FOLLOW_UP_MINUTES).max(MAX_FOLLOW_UP_MINUTES),
  })
  .refine((data) => (data.target === "category" ? !!data.categoryId : !data.categoryId), {
    message: 'categoryId is required for target "category"; it is not allowed for any other target',
    path: ["target"],
  });

// "Remind me again in four hours", asked straight after logging something.
//
// This exists as its own endpoint rather than as a POST "/" with a cleverly-built schedule for two
// reasons. First, the time has to be computed in the *user's* timezone - "four hours from now" is a
// wall-clock time on their day, and the browser's own clock is the wrong authority for the same
// reason it is for "end-of-day" above. Second, this replaces whatever temporary reminder was
// already running for the target rather than colliding with it: someone who has just logged the
// thing does not want to be told they already have a reminder, they want the one they just asked
// for.
//
// The result is an ordinary reminder, not a new kind of object: one cron time, expiring tonight,
// and stopsWhenLogged false - which it must be, because the user has *just* logged this target, so
// a reminder that stops when logged would be silenced before it ever fired.
remindersRouter.post("/follow-up", async (req, res) => {
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid follow-up",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { target, categoryId, inMinutes } = parsed.data;
  const prismaTarget = toPrismaReminderTarget(target);

  const timezone = await userTimezone(req.userId as string);
  if (!timezone) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  if (target === "category") {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    });
    if (!category) {
      return res.status(404).json({
        error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
      });
    }
  }

  // Wall-clock arithmetic on the user's own local time, deliberately - the stored schedule is a
  // cron expression, and cron times are local times. Truncated to the minute, which is all
  // currentTimeInTimezone reports and finer than the five-minute tick can act on anyway.
  const [nowHour, nowMinute] = currentTimeInTimezone(timezone).split(":").map(Number);
  const totalMinutes = nowHour * 60 + nowMinute + inMinutes;

  // Refused rather than rolled over into tomorrow. A schedule of "02:00" created at 22:00 would be
  // read by the scheduler as a slot that has *already passed today* - it fires late by design (see
  // reminderEligibility.ts), so the reminder would arrive immediately instead of in four hours.
  // Rejecting is honest; quietly delivering the opposite of what was asked for is not.
  if (totalMinutes >= 24 * 60) {
    return res.status(400).json({
      error: {
        message: "That would land tomorrow - a follow-up only runs for the rest of today",
        code: "FOLLOW_UP_PAST_MIDNIGHT",
      },
    });
  }

  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const firesAtLocal = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const expiresAt = getDayRangeUtc(todayInTimezone(timezone), timezone).end;

  // Replaces the live temporary reminder for this target, if there is one, rather than 409ing.
  // Deleting and recreating (instead of updating in place) also clears its ReminderSend rows by
  // cascade, which matters: those are keyed by (reminder, date, time), and a reused row could
  // carry a "already sent at 18:34 today" record from a schedule that no longer exists.
  const replaced = await prisma.reminder.deleteMany({
    where: {
      userId: req.userId,
      target: prismaTarget,
      categoryId: categoryId ?? null,
      expiresAt: { gt: new Date() },
    },
  });

  const reminder = await prisma.reminder.create({
    data: {
      userId: req.userId as string,
      target: prismaTarget,
      categoryId: categoryId ?? null,
      schedules: [`${minute} ${hour} * * *`],
      expiresAt,
      stopsWhenLogged: false,
    },
    include: REMINDER_INCLUDE,
  });

  // firesAtLocal travels with the response so the client can say "We'll remind you at 18:34"
  // without parsing cron or re-deriving the user's timezone - the same reasoning as POST
  // /preview's own `today`.
  res.status(201).json({
    ...serializeReminder(reminder),
    firesAtLocal,
    replacedExisting: replaced.count > 0,
  });
});

remindersRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid reminder",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { target, categoryId, schedules } = parsed.data;
  const prismaTarget = toPrismaReminderTarget(target);

  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    const timezone = await userTimezone(req.userId as string);
    if (!timezone) {
      return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
    }
    const resolved = resolveExpiresAt(parsed.data.expiresAt, timezone);
    if ("error" in resolved) {
      return res.status(400).json({
        error: {
          message: "Invalid reminder",
          code: "VALIDATION_ERROR",
          details: { expiresAt: [resolved.error] },
        },
      });
    }
    expiresAt = resolved.expiresAt;
  }

  // ID-tampering defense - the same pattern every other route with a foreign reference already
  // uses: scope the lookup by ownership/visibility before ever trusting the id in the request.
  if (target === "category") {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, archivedAt: null, OR: [{ userId: null }, { userId: req.userId }] },
    });
    if (!category) {
      return res.status(404).json({
        error: { message: "Category not found", code: "CATEGORY_NOT_FOUND" },
      });
    }
  }

  // At most one *standing* reminder per (user, target, categoryId), and at most one live
  // temporary one alongside it - an app-level check, not a DB constraint, matching this
  // codebase's established preference for this class of invariant (see e.g. CategoryLog's own
  // "exactly one value column" check in categoryLogs.ts).
  //
  // Splitting the old single rule in two is what makes a temporary reminder useful at all: "nudge
  // me every 30 minutes for the rest of today" is an *addition* to your normal daily reminder for
  // that category, not a replacement for it, so the two have to be able to coexist. Within each
  // kind the original "only one" rule is unchanged.
  //
  // An already-expired temporary reminder deliberately doesn't block a new one. It can never fire
  // again, and it's only still in the table because the sweep that removes it runs a day later
  // (see reminderScheduler.ts's own sweep) - being told "you already have one" by a reminder that
  // finished yesterday would be nonsense.
  const existing = await prisma.reminder.findFirst({
    where: {
      userId: req.userId,
      target: prismaTarget,
      categoryId: categoryId ?? null,
      ...(expiresAt ? { expiresAt: { gt: new Date() } } : { expiresAt: null }),
    },
  });
  if (existing) {
    return res.status(409).json(
      expiresAt
        ? {
            error: {
              message: "A temporary reminder for this is already running",
              code: "TEMPORARY_REMINDER_ALREADY_EXISTS",
            },
          }
        : {
            error: {
              message: "A reminder for this already exists",
              code: "REMINDER_ALREADY_EXISTS",
            },
          },
    );
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: req.userId as string,
      target: prismaTarget,
      categoryId: categoryId ?? null,
      schedules,
      expiresAt,
      stopsWhenLogged: parsed.data.stopsWhenLogged ?? true,
    },
    include: REMINDER_INCLUDE,
  });

  res.status(201).json(serializeReminder(reminder));
});

remindersRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: "Invalid reminder",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  // findFirst scoped to userId (not just findUnique by id) so another user's reminder 404s
  // instead of confirming its existence via a 403 - same "don't leak which case it is" principle
  // used throughout this codebase.
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Reminder not found", code: "REMINDER_NOT_FOUND" },
    });
  }

  const { expiresAt: rawExpiry, ...rest } = parsed.data;
  const data: {
    schedules?: string[];
    enabled?: boolean;
    stopsWhenLogged?: boolean;
    expiresAt?: Date | null;
  } = { ...rest };

  // An explicit null and an omitted field mean genuinely different things here, and the schema is
  // deliberately shaped so they stay distinguishable all the way down: null clears the expiry
  // (this reminder becomes standing again), undefined leaves the column untouched. Collapsing the
  // two - by treating any falsy value as "clear", say - is exactly the bug docs/LESSONS-LEARNED.md
  // records, where an edit that looked saved quietly changed something the user never touched.
  if (rawExpiry !== undefined) {
    if (rawExpiry === null) {
      // Becoming standing again means the "only one standing reminder for this target" rule
      // applies once more - and it has to be re-checked here, because it was legitimately allowed
      // to be broken while this one was temporary.
      const standing = await prisma.reminder.findFirst({
        where: {
          userId: req.userId,
          target: existing.target,
          categoryId: existing.categoryId,
          expiresAt: null,
          id: { not: existing.id },
        },
      });
      if (standing) {
        return res.status(409).json({
          error: {
            message: "A reminder for this already exists",
            code: "REMINDER_ALREADY_EXISTS",
          },
        });
      }
      data.expiresAt = null;
    } else {
      const timezone = await userTimezone(req.userId as string);
      if (!timezone) {
        return res
          .status(404)
          .json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
      }
      const resolved = resolveExpiresAt(rawExpiry, timezone);
      if ("error" in resolved) {
        return res.status(400).json({
          error: {
            message: "Invalid reminder",
            code: "VALIDATION_ERROR",
            details: { expiresAt: [resolved.error] },
          },
        });
      }
      data.expiresAt = resolved.expiresAt;
    }
  }

  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data,
    include: REMINDER_INCLUDE,
  });

  res.json(serializeReminder(reminder));
});

remindersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) {
    return res.status(404).json({
      error: { message: "Reminder not found", code: "REMINDER_NOT_FOUND" },
    });
  }

  // A real hard delete, unlike Category - a Reminder has no historical value of its own once
  // removed (unlike a log, there's nothing a user would ever want to look back on).
  await prisma.reminder.delete({ where: { id: existing.id } });
  res.status(200).json({ message: "Deleted" });
});

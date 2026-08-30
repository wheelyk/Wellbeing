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
import { hasLoggedTarget, quietHoursHoldUntil, reminderSlotsForDate } from "../lib/reminderRuns";
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
    // Defaults *true* on this path, unlike the column's own default - see below.
    allowDuringQuietHours: z.boolean().optional(),
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
    allowDuringQuietHours: z.boolean().optional(),
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

// How far ahead "Coming up" may look. Three fixed choices rather than an arbitrary number,
// because each one answers a different question - the rest of today, the week, the month - and an
// open range invites a client to ask for a year and get a wall of identical rows back.
//
// 90 was deliberately dropped: a daily reminder over 90 days is 90 rows that all say the same
// thing, which is a worse answer to "what's coming up" than a shorter honest one.
const UPCOMING_DAY_OPTIONS = ["1", "7", "30"] as const;

// A hard ceiling on the response instead of pagination. Pagination would imply the later pages
// are worth reading; they are not - past the two hundredth entry this has stopped being a preview
// and become a data dump, and a dashboard panel will show perhaps a dozen. The flag is set only
// when something was actually cut, so a client can say "and more" honestly rather than always.
const MAX_UPCOMING_RUNS = 200;

// Why each state exists at all, since three of the four describe a run that will *not* happen:
//
//   scheduled - it will fire, at the date and time given.
//   paused    - the reminder is switched off. Listed rather than hidden because "why am I not
//               being reminded?" is exactly the question this panel should answer, and an empty
//               panel answers it wrongly.
//   logged    - stopsWhenLogged, and the target is already logged today, so this slot is silenced.
//               Today only: whether tomorrow's will be logged by then is unknowable, and guessing
//               would be the kind of confident wrong answer this endpoint exists to avoid.
//   held      - inside the owner's quiet hours and not allowed through them. Listed at its real
//               time with deliveredAt saying when it will actually arrive, because the scheduler
//               genuinely defers rather than drops it (see reminderEligibility.ts).
type UpcomingRunState = "scheduled" | "paused" | "logged" | "held";

interface UpcomingRun {
  date: string;
  time: string;
  reminderId: string;
  target: string;
  category: { name: string; icon: string | null } | null;
  state: UpcomingRunState;
  // Only present on a held run.
  deliveredAt?: string;
}

const upcomingDaysSchema = z.enum(["1", "7", "30"]).default("1").transform(Number);

// "When will my reminders actually fire?", merged across every reminder and answered with the
// scheduler's own rules rather than a second set that agrees with them today.
//
// The trap this endpoint is built around: `nextRunsForSchedules` (see lib/cron.ts) looks like
// exactly the right function and is not. It understands cron expressions and nothing else - it has
// never heard of `enabled`, `startsAt`, `expiresAt`, `stopsWhenLogged` or quiet hours, all of
// which arrived after it was written. Built on it as-is, this would confidently list runs that
// never happen: expired temporary reminders, follow-ups that have not started, and a 03:46 slot
// that quiet hours will really deliver at 08:00. So the firing rules come from lib/reminderRuns.ts
// - the same module the scheduler itself now calls. See docs/log/42-upcoming-reminders.md.
//
// Declared before the "/:id" routes below for readability; GET "/upcoming" is already unambiguous
// to Express, since no GET route here takes a path parameter.
remindersRouter.get("/upcoming", async (req, res) => {
  const parsedDays = upcomingDaysSchema.safeParse(req.query.days);
  if (!parsedDays.success) {
    return res.status(400).json({
      error: {
        message: "Invalid range",
        code: "VALIDATION_ERROR",
        details: { days: [`days must be one of ${UPCOMING_DAY_OPTIONS.join(", ")}`] },
      },
    });
  }
  const days = parsedDays.data;

  // The scheduler resolves every reminder against the owner's *stored* timezone and quiet hours,
  // so anything answering "when will it fire" has to read the same two columns. Using the server's
  // clock here would produce a list that is plausibly wrong rather than visibly wrong.
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { timezone: true, quietHoursStart: true, quietHoursEnd: true },
  });
  if (!user) {
    return res.status(404).json({ error: { message: "User not found", code: "USER_NOT_FOUND" } });
  }

  const timezone = user.timezone;
  const quietHours = { start: user.quietHoursStart, end: user.quietHoursEnd };
  const today = todayInTimezone(timezone);
  const nowLocalTime = currentTimeInTimezone(timezone);

  // Every reminder, including disabled ones - `enabled` is a state to report here, not a filter.
  // Created-order is the tiebreak for two reminders sharing a slot (see the stable sort below).
  const reminders = await prisma.reminder.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: REMINDER_INCLUDE,
  });

  // "Has this target been logged today" depends only on the target, not on the reminder - two
  // reminders about the same category share one answer, and one reminder's many slots share it
  // too. Memoised as the in-flight promise rather than the resolved value so a second caller
  // waits on the first query instead of starting a duplicate.
  const loggedTodayByTarget = new Map<string, Promise<boolean>>();
  function loggedToday(reminder: { target: PrismaReminderTarget; categoryId: string | null }) {
    const key = reminder.target === "CATEGORY" ? `CATEGORY:${reminder.categoryId}` : "GENERAL";
    let answer = loggedTodayByTarget.get(key);
    if (!answer) {
      const { start, end } = getDayRangeUtc(today, timezone);
      answer = hasLoggedTarget(reminder, req.userId as string, start, end);
      loggedTodayByTarget.set(key, answer);
    }
    return answer;
  }

  // Precedence, most dominant first. A reminder can be several of these at once - switched off,
  // already logged, *and* inside quiet hours - and only one word fits in the response, so the one
  // that best explains "you will not hear from this" wins. Paused is the largest fact about a
  // reminder; logged silences the slot outright; held still delivers, just later.
  async function stateOf(
    reminder: (typeof reminders)[number],
    time: string,
    isToday: boolean,
  ): Promise<{ state: UpcomingRunState; deliveredAt?: string }> {
    if (!reminder.enabled) return { state: "paused" };
    if (isToday && reminder.stopsWhenLogged && (await loggedToday(reminder))) {
      return { state: "logged" };
    }
    const deliveredAt = quietHoursHoldUntil(time, reminder.allowDuringQuietHours, quietHours);
    if (deliveredAt !== null) return { state: "held", deliveredAt };
    return { state: "scheduled" };
  }

  const runs: UpcomingRun[] = [];
  let truncated = false;

  // Day by day, ascending - which is what makes the result chronological without ever sorting the
  // whole list, and what lets the cap stop the work rather than just trim the output.
  for (let offset = 0; offset < days && !truncated; offset += 1) {
    const date = addDaysToDateStr(today, offset);
    const isToday = offset === 0;

    const daySlots: { time: string; reminder: (typeof reminders)[number] }[] = [];
    for (const reminder of reminders) {
      const slots = reminderSlotsForDate({
        date,
        schedules: reminder.schedules,
        timeZone: timezone,
        startsAt: reminder.startsAt,
        expiresAt: reminder.expiresAt,
        // No onUnparseable: a stored expression that no longer parses is skipped silently here.
        // The scheduler logs it once per tick, which is the right place for that; a read-only
        // preview scanning thirty days would write the same line thirty times per request.
      });
      for (const time of slots) {
        // Strictly future, matching POST /preview's own convention (see lib/cron.ts): a slot at or
        // before the current minute has either just fired or is about to, and "coming up" is not
        // the place to relitigate this morning.
        if (isToday && time <= nowLocalTime) continue;
        daySlots.push({ time, reminder });
      }
    }

    // Array#sort is stable, so two reminders due at the same minute stay in the created-order the
    // query returned them in - a deterministic list rather than one that reshuffles between calls.
    daySlots.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

    for (const { time, reminder } of daySlots) {
      if (runs.length >= MAX_UPCOMING_RUNS) {
        truncated = true;
        break;
      }
      runs.push({
        date,
        time,
        reminderId: reminder.id,
        target: toApiReminderTarget(reminder.target),
        category: reminder.category,
        ...(await stateOf(reminder, time, isToday)),
      });
    }
  }

  // `today` travels with the response for the same reason POST /preview sends it: the client then
  // only ever compares date strings and never has to decide what day it is in someone else's
  // timezone, which is exactly where this class of bug lives.
  res.json({ timezone, today, truncated, runs });
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
// Raised from 12 hours once startsAt made a follow-up able to land tomorrow. A cooldown may be up
// to 24 hours (see lib/categoryTiming.ts), and a cooldown's "you can have another now" is created
// through this endpoint - a ceiling below that would have made the longer gaps silently unable to
// notify at all.
const MAX_FOLLOW_UP_MINUTES = 24 * 60;

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

  // Crossing midnight used to be refused outright, because the scheduler fires late by design (see
  // reminderEligibility.ts) and would have read "03:46" as a slot already gone by, delivering it
  // immediately. startsAt is what makes that expressible instead: the slot is real, it just isn't
  // allowed to fire before the moment asked for. See docs/log/40-reminder-starts-at.md.
  const daysAhead = Math.floor(totalMinutes / (24 * 60));
  const minutesIntoDay = totalMinutes % (24 * 60);
  const hour = Math.floor(minutesIntoDay / 60);
  const minute = minutesIntoDay % 60;
  const firesAtLocal = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const firesOnDate = addDaysToDateStr(todayInTimezone(timezone), daysAhead);
  // The exact instant the slot represents: the start of its own local day, plus the wall-clock
  // minutes into it. Derived from getDayRangeUtc rather than assembled by hand so it stays right
  // across a DST boundary, where a local day is not 24 hours long.
  const startsAt = new Date(
    getDayRangeUtc(firesOnDate, timezone).start.getTime() + minutesIntoDay * 60 * 1000,
  );
  // Expires at the end of the day it fires on, not today's - a one-shot must outlive the day it
  // was created on when it lands on the next one.
  const expiresAt = getDayRangeUtc(firesOnDate, timezone).end;

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
      startsAt,
      expiresAt,
      stopsWhenLogged: false,
      // The time here was computed from "in six hours", not chosen - so it is this route's job not
      // to wake anyone with it. Held until quiet hours end rather than dropped (see
      // reminderEligibility.ts), so the notification still arrives, just at a civilised hour.
      allowDuringQuietHours: false,
    },
    include: REMINDER_INCLUDE,
  });

  // firesAtLocal travels with the response so the client can say "We'll remind you at 18:34"
  // without parsing cron or re-deriving the user's timezone - the same reasoning as POST
  // /preview's own `today`.
  res.status(201).json({
    ...serializeReminder(reminder),
    firesAtLocal,
    // Whether that time is today or tomorrow, so the client can say so rather than leaving someone
    // to work out that "03:46" cannot mean this morning.
    firesTomorrow: daysAhead > 0,
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
      // True by default on this path only. Someone who sets a reminder for 03:00 here has asked
      // for 03:00 in as many words, and quiet hours have no business overruling them. The
      // follow-up route below is the opposite case and defaults the other way.
      allowDuringQuietHours: parsed.data.allowDuringQuietHours ?? true,
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
    allowDuringQuietHours?: boolean;
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

import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

// Its own file rather than an addition to reminders.test.ts, for two reasons. That file ends in a
// top-level `afterAll`, and appending a `describe` before its final `});` is a well-known way to
// nest tests inside it where they silently never run (see docs/log/41-quiet-hours.md). And every
// test here needs a fixed clock, which the rest of that file deliberately does not have.
//
// Only `Date` is faked, not the timer functions. The clock has to be fixed - every assertion below
// is about a specific local date and time - but supertest drives a real HTTP round trip over a
// real socket, and there is no reason to put a fake `setTimeout`/`setImmediate` underneath that.
//
// 2026-08-30 is a Sunday, and 12:05 UTC is chosen so that a morning slot has already gone by and an
// afternoon or evening one has not.
const NOW = "2026-08-30T12:05:00.000Z";
const TODAY = "2026-08-30";
const TOMORROW = "2026-08-31";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-upcoming-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(
  label: string,
  user: { timezone?: string; quietHoursStart?: string | null; quietHoursEnd?: string | null } = {},
) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  // Quiet hours default to 22:00-08:00 on a real account. Cleared unless a test is specifically
  // about them, so no unrelated assertion silently depends on which side of the window its slot
  // happens to fall.
  await prisma.user.update({
    where: { email },
    data: {
      timezone: user.timezone ?? "UTC",
      quietHoursStart: user.quietHoursStart ?? null,
      quietHoursEnd: user.quietHoursEnd ?? null,
    },
  });
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "Sup3rSecret" });
  return {
    userId: loginRes.body.user.id as string,
    accessToken: loginRes.body.accessToken as string,
  };
}

function authed(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// Rows are created straight through Prisma rather than through POST /api/reminders, matching
// reminderScheduler.test.ts's own style: the create route has its own ownership and validation
// tests in reminders.test.ts, and several shapes here (a disabled reminder, an already-expired
// one) cannot be produced through it at all.
async function createReminder(
  userId: string,
  overrides: {
    target?: "GENERAL" | "CATEGORY";
    categoryId?: string;
    schedules?: string[];
    enabled?: boolean;
    startsAt?: Date | null;
    expiresAt?: Date | null;
    stopsWhenLogged?: boolean;
    allowDuringQuietHours?: boolean;
  } = {},
) {
  return prisma.reminder.create({
    data: {
      userId,
      target: overrides.target ?? "GENERAL",
      categoryId: overrides.categoryId,
      schedules: overrides.schedules ?? ["0 20 * * *"],
      enabled: overrides.enabled ?? true,
      startsAt: overrides.startsAt ?? null,
      expiresAt: overrides.expiresAt ?? null,
      stopsWhenLogged: overrides.stopsWhenLogged ?? true,
      // True unless a test is about quiet hours, for the same reason the window is cleared above.
      allowDuringQuietHours: overrides.allowDuringQuietHours ?? true,
    },
  });
}

async function upcoming(accessToken: string, days?: number) {
  const req = request(app).get("/api/reminders/upcoming").set(authed(accessToken));
  return days === undefined ? req : req.query({ days });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/reminders/upcoming", () => {
  it("rejects a request with no access token", async () => {
    const res = await request(app).get("/api/reminders/upcoming");
    expect(res.status).toBe(401);
  });

  it("rejects any days value that isn't 1, 7 or 30", async () => {
    const { accessToken } = await registerAndLogin("bad-days");

    for (const days of ["2", "90", "0", "-7", "abc", ""]) {
      const res = await request(app)
        .get("/api/reminders/upcoming")
        .query({ days })
        .set(authed(accessToken));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.days[0]).toContain("1, 3, 7");
    }
  });

  it("accepts each of the three allowed windows", async () => {
    const { accessToken, userId } = await registerAndLogin("good-days");
    await createReminder(userId, { schedules: ["0 20 * * *"] });

    for (const [days, expected] of [
      [1, 1],
      [3, 3],
      [7, 7],
    ] as const) {
      const res = await upcoming(accessToken, days);
      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(expected);
    }
  });

  it("defaults to one day and answers in the caller's stored timezone", async () => {
    const { accessToken, userId } = await registerAndLogin("default-days");
    await createReminder(userId, { schedules: ["0 20 * * *"] });

    const res = await upcoming(accessToken);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ timezone: "UTC", today: TODAY, truncated: false });
    expect(res.body.runs).toEqual([
      {
        date: TODAY,
        time: "20:00",
        reminderId: expect.any(String),
        target: "general",
        categoryId: null,
        category: null,
        state: "scheduled",
      },
    ]);
  });

  it("lists one run per day across the window, in date order", async () => {
    const { accessToken, userId } = await registerAndLogin("week");
    await createReminder(userId, { schedules: ["0 20 * * *"] });

    const res = await upcoming(accessToken, 7);

    expect(res.body.runs.map((r: { date: string }) => r.date)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(res.body.truncated).toBe(false);
  });

  it("leaves out a slot that has already gone by today, but keeps it on later days", async () => {
    const { accessToken, userId } = await registerAndLogin("past-today");
    // 09:00 is behind the 12:05 clock; 20:00 is ahead of it.
    await createReminder(userId, { schedules: ["0 9 * * *", "0 20 * * *"] });

    const today = await upcoming(accessToken, 1);
    expect(today.body.runs.map((r: { time: string }) => r.time)).toEqual(["20:00"]);

    const week = await upcoming(accessToken, 7);
    expect(
      week.body.runs
        .filter((r: { date: string }) => r.date === TOMORROW)
        .map((r: { time: string }) => r.time),
    ).toEqual(["09:00", "20:00"]);
  });

  it("merges several reminders into one chronological list", async () => {
    const { accessToken, userId } = await registerAndLogin("merge");
    const evening = await createReminder(userId, { schedules: ["0 20 * * *"] });
    const category = await prisma.category.create({
      data: { userId, name: "Water intake", valueType: "NUMERIC", icon: "💧" },
    });
    const spread = await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: ["0 14 * * *", "0 22 * * *"],
    });

    const res = await upcoming(accessToken, 1);

    expect(
      res.body.runs.map((r: { time: string; reminderId: string }) => [r.time, r.reminderId]),
    ).toEqual([
      ["14:00", spread.id],
      ["20:00", evening.id],
      ["22:00", spread.id],
    ]);
  });

  it("carries a category's name and icon, and null for a general reminder", async () => {
    const { accessToken, userId } = await registerAndLogin("category-shape");
    const category = await prisma.category.create({
      data: { userId, name: "Sertraline", valueType: "BOOLEAN", icon: "💊" },
    });
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: ["0 14 * * *"],
    });
    await createReminder(userId, { schedules: ["0 20 * * *"] });

    const res = await upcoming(accessToken, 1);

    expect(res.body.runs[0]).toMatchObject({
      target: "category",
      categoryId: category.id,
      category: { name: "Sertraline", icon: "💊" },
    });
    expect(res.body.runs[1]).toMatchObject({ target: "general", categoryId: null, category: null });
  });

  it("lists a switched-off reminder as paused rather than hiding it", async () => {
    const { accessToken, userId } = await registerAndLogin("paused", {
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
    // Also inside quiet hours and not allowed through them - "paused" must win, because being
    // switched off is the larger fact about why nothing will arrive.
    await createReminder(userId, {
      schedules: ["30 23 * * *"],
      enabled: false,
      allowDuringQuietHours: false,
    });

    const res = await upcoming(accessToken, 1);

    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0]).toMatchObject({ time: "23:30", state: "paused" });
    expect(res.body.runs[0].deliveredAt).toBeUndefined();
  });

  it("leaves out a temporary reminder whose expiry has already passed", async () => {
    const { accessToken, userId } = await registerAndLogin("expired");
    // Expired at 10:00 today, still in the table because the sweep runs a day later.
    await createReminder(userId, {
      schedules: ["0 20 * * *"],
      expiresAt: new Date("2026-08-30T10:00:00.000Z"),
    });

    const res = await upcoming(accessToken, 7);

    expect(res.body.runs).toEqual([]);
  });

  it("stops a temporary reminder's runs at its expiry instead of repeating it forever", async () => {
    const { accessToken, userId } = await registerAndLogin("expiring");
    // "Nudge me every evening for the rest of today": 20:00 is still inside the window, 22:00 is
    // past it, and tomorrow's slots do not exist at all.
    await createReminder(userId, {
      schedules: ["0 20 * * *", "0 22 * * *"],
      expiresAt: new Date("2026-08-30T21:00:00.000Z"),
    });

    const res = await upcoming(accessToken, 7);

    expect(res.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "20:00", state: "scheduled" }),
    ]);
  });

  it("leaves out a follow-up that hasn't started, and lists it on the day it does", async () => {
    const { accessToken, userId } = await registerAndLogin("follow-up");
    // The shape POST /api/reminders/follow-up creates for "remind me in six hours" asked at
    // 21:46 the night before: a single cron time, a start it must not precede, and an expiry at
    // the end of the day it lands on. See docs/log/40-reminder-starts-at.md.
    await createReminder(userId, {
      schedules: ["46 3 * * *"],
      startsAt: new Date("2026-08-31T03:46:00.000Z"),
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      stopsWhenLogged: false,
    });

    const today = await upcoming(accessToken, 1);
    expect(today.body.runs).toEqual([]);

    const week = await upcoming(accessToken, 7);
    expect(week.body.runs).toEqual([
      expect.objectContaining({ date: TOMORROW, time: "03:46", state: "scheduled" }),
    ]);
  });

  it("leaves out a slot earlier than the start on the day a reminder starts", async () => {
    const { accessToken, userId } = await registerAndLogin("starts-later-today");
    // Starts at 18:00 today. 14:00 is still ahead of the 12:05 clock, so it is not excluded for
    // having gone by - it was simply never one of this reminder's slots. This is the only test
    // here that separates those two reasons for a slot being absent.
    await createReminder(userId, {
      schedules: ["0 14 * * *", "0 18 * * *", "0 20 * * *"],
      startsAt: new Date("2026-08-30T18:00:00.000Z"),
    });

    const res = await upcoming(accessToken, 1);

    // 18:00 is included: a slot at exactly the start time is allowed through, matching the
    // scheduler's own `startsAt <= now` candidate filter.
    expect(res.body.runs.map((r: { time: string }) => r.time)).toEqual(["18:00", "20:00"]);
  });

  it("marks a slot inside quiet hours as held, at its real time, with when it will arrive", async () => {
    const { accessToken, userId } = await registerAndLogin("held", {
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
    await createReminder(userId, {
      schedules: ["30 23 * * *"],
      allowDuringQuietHours: false,
    });

    const res = await upcoming(accessToken, 1);

    // Listed at 23:30, not moved to 08:00 - the slot is real, the delivery is deferred.
    expect(res.body.runs).toEqual([
      expect.objectContaining({ time: "23:30", state: "held", deliveredAt: "08:00" }),
    ]);
  });

  it("leaves a reminder allowed through quiet hours scheduled", async () => {
    const { accessToken, userId } = await registerAndLogin("allowed-through", {
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    });
    // You set 23:30 by hand, so you asked for 23:30 in as many words.
    await createReminder(userId, {
      schedules: ["30 23 * * *"],
      allowDuringQuietHours: true,
    });

    const res = await upcoming(accessToken, 1);

    expect(res.body.runs[0]).toMatchObject({ time: "23:30", state: "scheduled" });
    expect(res.body.runs[0].deliveredAt).toBeUndefined();
  });

  it("marks today's slot logged when the target is done, but never a future day's", async () => {
    const { accessToken, userId } = await registerAndLogin("logged");
    const category = await prisma.category.create({
      data: { userId, name: "Sertraline", valueType: "BOOLEAN" },
    });
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: ["0 14 * * *"],
      stopsWhenLogged: true,
    });
    await prisma.categoryLog.create({
      data: { userId, categoryId: category.id, valueBoolean: true },
    });

    const res = await upcoming(accessToken, 7);

    expect(res.body.runs[0]).toMatchObject({ date: TODAY, state: "logged" });
    // Whether tomorrow's will have been logged by tomorrow is unknowable, so it is not guessed.
    expect(res.body.runs[1]).toMatchObject({ date: TOMORROW, state: "scheduled" });
  });

  it("does not mark a rhythm reminder as logged", async () => {
    const { accessToken, userId } = await registerAndLogin("rhythm");
    const category = await prisma.category.create({
      data: { userId, name: "Water intake", valueType: "NUMERIC" },
    });
    // stopsWhenLogged false is "nudge me on a rhythm" - logging it changes nothing.
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: ["0 14 * * *"],
      stopsWhenLogged: false,
    });
    await prisma.categoryLog.create({ data: { userId, categoryId: category.id, valueNumeric: 3 } });

    const res = await upcoming(accessToken, 1);

    expect(res.body.runs[0]).toMatchObject({ date: TODAY, state: "scheduled" });
  });

  it("does not treat logging a different category as logging this one", async () => {
    const { accessToken, userId } = await registerAndLogin("wrong-category");
    const diazepam = await prisma.category.create({
      data: { userId, name: "Diazepam", valueType: "BOOLEAN" },
    });
    const sertraline = await prisma.category.create({
      data: { userId, name: "Sertraline", valueType: "BOOLEAN" },
    });
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId: diazepam.id,
      schedules: ["0 14 * * *"],
    });
    await prisma.categoryLog.create({
      data: { userId, categoryId: sertraline.id, valueBoolean: true },
    });

    const res = await upcoming(accessToken, 1);

    expect(res.body.runs[0]).toMatchObject({ state: "scheduled" });
  });

  it("resolves the whole answer in the caller's own timezone, not the server's", async () => {
    // The identical reminder, the identical instant, two different stored timezones. At 12:05 UTC
    // it is 05:05 in Los Angeles, so 09:00 is still ahead there and already behind in UTC.
    // Getting this backwards is the fire-on-the-wrong-day bug the timezone discipline exists for.
    const west = await registerAndLogin("timezone-west", { timezone: "America/Los_Angeles" });
    await createReminder(west.userId, { schedules: ["0 9 * * *"] });
    const utc = await registerAndLogin("timezone-utc");
    await createReminder(utc.userId, { schedules: ["0 9 * * *"] });

    const westRes = await upcoming(west.accessToken, 1);
    expect(westRes.body.timezone).toBe("America/Los_Angeles");
    expect(westRes.body.today).toBe(TODAY);
    expect(westRes.body.runs).toEqual([
      expect.objectContaining({ date: TODAY, time: "09:00", state: "scheduled" }),
    ]);

    const utcRes = await upcoming(utc.accessToken, 1);
    expect(utcRes.body.runs).toEqual([]);
  });

  it("caps the list at 200 entries and says it was cut", async () => {
    const { accessToken, userId } = await registerAndLogin("truncated");
    // Six times a day each is the most that stays listed rather than collapsing into one row, and
    // /upcoming now only reaches 7 days ahead at most (aligned with /recent - see docs/log/49) -
    // so five reminders (30 entries/day) over 7 days is 210, comfortably past the cap without
    // relying on a cadence, which would now be merged.
    const category = await prisma.category.create({
      data: { userId, name: "Water intake", valueType: "NUMERIC", icon: "💧" },
    });
    await createReminder(userId, {
      schedules: Array.from({ length: 6 }, (_, i) => `0 ${13 + i} * * *`),
    });
    await createReminder(userId, {
      target: "CATEGORY",
      categoryId: category.id,
      schedules: Array.from({ length: 6 }, (_, i) => `30 ${13 + i} * * *`),
    });
    await createReminder(userId, {
      schedules: Array.from({ length: 6 }, (_, i) => `10 ${13 + i} * * *`),
    });
    await createReminder(userId, {
      schedules: Array.from({ length: 6 }, (_, i) => `20 ${13 + i} * * *`),
    });
    await createReminder(userId, {
      schedules: Array.from({ length: 6 }, (_, i) => `40 ${13 + i} * * *`),
    });

    const res = await upcoming(accessToken, 7);

    expect(res.body.runs).toHaveLength(200);
    expect(res.body.truncated).toBe(true);
    // Still chronological up to the cut, and cut from the far end rather than sampled.
    expect(res.body.runs[0]).toMatchObject({ date: TODAY, time: "13:00" });
  });

  // A single hourly reminder used to fill the Dashboard panel with twenty-four near-identical rows.
  // Found by pointing the panel at a real account, not by any test - see docs/log/46.
  describe("collapsing a cadence", () => {
    it("merges a day of hourly slots into one row that says how many", async () => {
      const { accessToken, userId } = await registerAndLogin("collapse-hourly");
      await createReminder(userId, { schedules: ["0 * * * *"] });

      const res = await upcoming(accessToken, 1);

      // 13:00 through 23:00 - the ones still to come after 12:05.
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0]).toMatchObject({
        date: TODAY,
        time: "13:00",
        repeatCount: 11,
        lastTime: "23:00",
      });
    });

    // The case that matters most: a hand-written list of times is what somebody deliberately chose,
    // and merging two of them into "2 times" would be actively worse than listing them.
    it("leaves a hand-written set of times listed", async () => {
      const { accessToken, userId } = await registerAndLogin("collapse-listed");
      await createReminder(userId, { schedules: ["0 14 * * *", "0 20 * * *", "0 22 * * *"] });

      const res = await upcoming(accessToken, 1);

      expect(res.body.runs.map((r: { time: string }) => r.time)).toEqual([
        "14:00",
        "20:00",
        "22:00",
      ]);
      expect(
        res.body.runs.every((r: { repeatCount?: number }) => r.repeatCount === undefined),
      ).toBe(true);
    });

    // An hourly reminder that runs into quiet hours is genuinely two different things. Merging them
    // would produce one row claiming a single state for slots that do not share one.
    it("does not merge slots whose state differs", async () => {
      const { accessToken, userId } = await registerAndLogin("collapse-split", {
        quietHoursStart: "14:00",
        quietHoursEnd: "08:00",
      });
      await createReminder(userId, {
        schedules: ["0 * * * *"],
        allowDuringQuietHours: false,
      });

      const res = await upcoming(accessToken, 1);

      // 13:00 fires as scheduled; 14:00-23:00 are all held until the window ends. Two entries, not
      // one - a single row claiming one state for slots that do not share one would be a lie.
      expect(res.body.runs).toHaveLength(2);
      expect(res.body.runs[0]).toMatchObject({ time: "13:00", state: "scheduled" });
      expect(res.body.runs[0].repeatCount).toBeUndefined();
      expect(res.body.runs[1]).toMatchObject({
        time: "14:00",
        state: "held",
        deliveredAt: "08:00",
        repeatCount: 10,
        lastTime: "23:00",
      });
    });
  });

  it("returns an empty list for an account with no reminders at all", async () => {
    const { accessToken } = await registerAndLogin("none");

    const res = await upcoming(accessToken, 7);

    expect(res.body).toMatchObject({ timezone: "UTC", today: TODAY, truncated: false, runs: [] });
  });

  it("never shows another user's reminders", async () => {
    const mine = await registerAndLogin("mine");
    const theirs = await registerAndLogin("theirs");
    await createReminder(theirs.userId, { schedules: ["0 20 * * *"] });

    const res = await upcoming(mine.accessToken, 7);

    expect(res.body.runs).toEqual([]);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});

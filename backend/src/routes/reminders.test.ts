import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-reminders-route-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(label: string) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
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

async function createCategory(accessToken: string, name = "Water intake") {
  const res = await request(app)
    .post("/api/categories")
    .set(authed(accessToken))
    .send({ name, valueType: "numeric" });
  return res.body.id as string;
}

describe("reminders routes", () => {
  it("reject every method with no access token", async () => {
    const getRes = await request(app).get("/api/reminders");
    expect(getRes.status).toBe(401);

    const postRes = await request(app)
      .post("/api/reminders")
      .send({ target: "general", schedules: ["0 20 * * *"] });
    expect(postRes.status).toBe(401);
  });

  it("creates a GENERAL reminder with a single time", async () => {
    const { accessToken, userId } = await registerAndLogin("general-create");

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 20 * * *"] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      target: "general",
      schedules: ["0 20 * * *"],
      enabled: true,
    });
  });

  it("dedupes schedules while preserving the order they were given in", async () => {
    const { accessToken } = await registerAndLogin("dedupe");

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 15 * * *", "0 9 * * *", "0 15 * * *"] });

    expect(res.status).toBe(201);
    // Note the order: 15:00 first, because that's how it was sent. Cron expressions have no
    // meaningful lexicographic order, so unlike the "HH:mm" times this replaced they aren't
    // sorted - see the schedulesSchema comment in reminders.ts.
    expect(res.body.schedules).toEqual(["0 15 * * *", "0 9 * * *"]);
  });

  it("rejects a malformed expression and more than the maximum number of schedules", async () => {
    const { accessToken } = await registerAndLogin("bad-schedules");

    const badFormat = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["8:00pm"] });
    expect(badFormat.status).toBe(400);

    // The old "HH:mm" shape is now simply an invalid expression, not a special case - worth
    // asserting explicitly so a client still sending the pre-cron format fails loudly rather than
    // being silently reinterpreted (see docs/log/25-cron-reminder-schedules.md).
    const oldFormat = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["09:00"] });
    expect(oldFormat.status).toBe(400);

    // Valid syntax, but it would fire far more often than the per-expression cap allows.
    const tooOften = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["* * * * *"] });
    expect(tooOften.status).toBe(400);

    const tooMany = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({
        target: "general",
        // Thirteen distinct expressions - one past the cap. Deliberately more than the picker can
        // produce (four rules), since this guards the API against a runaway request rather than
        // the UI against itself.
        schedules: Array.from({ length: 13 }, (_, hour) => `0 ${hour} * * *`),
      });
    expect(tooMany.status).toBe(400);
  });

  // The whole point of moving off fixed "HH:mm" times: schedules that simply couldn't be
  // expressed before. Each of these round-trips through validation and comes back unchanged.
  it("accepts recurring and day-restricted schedules, storing them verbatim", async () => {
    const { accessToken } = await registerAndLogin("expressive");
    // One reminder, re-scheduled repeatedly, rather than one per expression: a user may only have
    // a single GENERAL reminder (see the 409 test below), and PATCH exercises the same
    // schedulesSchema the create path does.
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 9 * * *"] });
    expect(created.status).toBe(201);

    for (const expression of [
      "0 * * * *", // every hour
      "0 8 * * 1-5", // weekdays only
      "30 10 * * 0,6", // weekends only
      "30 18 * * 1,3,5", // Mon/Wed/Fri
      "0 7 1,15 * *", // 1st and 15th of the month
    ]) {
      const res = await request(app)
        .patch(`/api/reminders/${created.body.id}`)
        .set(authed(accessToken))
        .send({ schedules: [expression] });

      expect(res.status).toBe(200);
      // Stored exactly as written - never normalised into some other equivalent form, so what the
      // user typed is what they see when they come back to edit it.
      expect(res.body.schedules).toEqual([expression]);
    }
  });

  // The preview is what makes the picker trustworthy: it is answered by the same cron code the
  // scheduler runs, so a disagreement between what the UI draws and what will actually fire shows
  // up here rather than as a reminder arriving on the wrong day.
  describe("POST /preview", () => {
    it("returns the next few runs for an unsaved schedule, in the caller timezone", async () => {
      const { accessToken } = await registerAndLogin("preview");

      const res = await request(app)
        .post("/api/reminders/preview")
        .set(authed(accessToken))
        .send({ schedules: ["0 8 * * *"] });

      expect(res.status).toBe(200);
      expect(res.body.timezone).toBe("UTC");
      expect(res.body.nextRuns).toHaveLength(3);
      // Shape rather than exact values - the wall clock moves, and cron.test.ts pins the clock to
      // assert the arithmetic itself.
      for (const run of res.body.nextRuns) {
        expect(run.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(run.time).toBe("08:00");
      }
    });

    it("previews a schedule that has not been saved, and saves nothing", async () => {
      const { accessToken } = await registerAndLogin("preview-no-save");

      await request(app)
        .post("/api/reminders/preview")
        .set(authed(accessToken))
        .send({ schedules: ["0 8 * * 1-5"] });

      const list = await request(app).get("/api/reminders").set(authed(accessToken));
      expect(list.body).toHaveLength(0);
    });

    it("merges several rules into one chronological list", async () => {
      const { accessToken } = await registerAndLogin("preview-rules");

      const res = await request(app)
        .post("/api/reminders/preview")
        .set(authed(accessToken))
        .send({ schedules: ["0 8 * * 1-5", "0 10 * * 0,6"] });

      expect(res.status).toBe(200);
      const times = res.body.nextRuns.map((r: { time: string }) => r.time);
      // Every run is one of the two rules, and they are ordered by date then time.
      expect(times.every((t: string) => t === "08:00" || t === "10:00")).toBe(true);
      const keys = res.body.nextRuns.map((r: { date: string; time: string }) => r.date + r.time);
      expect(keys).toEqual([...keys].sort());
    });

    it("rejects an invalid expression with the same message the save path gives", async () => {
      const { accessToken } = await registerAndLogin("preview-invalid");

      const res = await request(app)
        .post("/api/reminders/preview")
        .set(authed(accessToken))
        .send({ schedules: ["0 25 * * *"] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("401s without an access token", async () => {
      const res = await request(app)
        .post("/api/reminders/preview")
        .send({ schedules: ["0 8 * * *"] });
      expect(res.status).toBe(401);
    });
  });

  it("rejects a CATEGORY reminder with no categoryId, or one not visible to the caller", async () => {
    const owner = await registerAndLogin("category-owner");
    const intruder = await registerAndLogin("category-intruder");
    const categoryId = await createCategory(owner.accessToken);

    const missing = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "category", schedules: ["0 10 * * *"] });
    expect(missing.status).toBe(400);

    const wrongOwner = await request(app)
      .post("/api/reminders")
      .set(authed(intruder.accessToken))
      .send({ target: "category", categoryId, schedules: ["0 10 * * *"] });
    expect(wrongOwner.status).toBe(404);
    expect(wrongOwner.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("creates a CATEGORY reminder for a specific, visible category", async () => {
    const { accessToken } = await registerAndLogin("category-create");
    const categoryId = await createCategory(accessToken);

    const res = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "category", categoryId, schedules: ["0 9 * * *"] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ target: "category", categoryId });
    expect(res.body.category).toMatchObject({ name: "Water intake" });
  });

  it("rejects a categoryId sent with the wrong target", async () => {
    const { accessToken } = await registerAndLogin("mixed-ids");
    const categoryId = await createCategory(accessToken);

    const generalWithCategory = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", categoryId, schedules: ["0 9 * * *"] });
    expect(generalWithCategory.status).toBe(400);
  });

  it("409s creating a second reminder for the same (target, medication/category)", async () => {
    const { accessToken } = await registerAndLogin("duplicate");

    const first = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 9 * * *"] });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 15 * * *"] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REMINDER_ALREADY_EXISTS");
  });

  it("allows two independent reminders for two different categories", async () => {
    const { accessToken } = await registerAndLogin("two-categories");
    const diazepam = await createCategory(accessToken, "Diazepam");
    const sertraline = await createCategory(accessToken, "Sertraline");

    const first = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "category", categoryId: diazepam, schedules: ["0 10 * * *"] });
    const second = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "category", categoryId: sertraline, schedules: ["30 8 * * *"] });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("lists only the authenticated user's own reminders", async () => {
    const userA = await registerAndLogin("list-a");
    const userB = await registerAndLogin("list-b");
    await request(app)
      .post("/api/reminders")
      .set(authed(userA.accessToken))
      .send({ target: "general", schedules: ["0 20 * * *"] });
    await request(app)
      .post("/api/reminders")
      .set(authed(userB.accessToken))
      .send({ target: "general", schedules: ["0 21 * * *"] });

    const res = await request(app).get("/api/reminders").set(authed(userA.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(userA.userId);
  });

  it("updates schedules and enabled, but not target/categoryId", async () => {
    const { accessToken } = await registerAndLogin("update");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 9 * * *"] });

    const res = await request(app)
      .patch(`/api/reminders/${created.body.id}`)
      .set(authed(accessToken))
      .send({ schedules: ["0 9 * * *", "0 15 * * *"], enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      target: "general",
      schedules: ["0 9 * * *", "0 15 * * *"],
      enabled: false,
    });
  });

  it("returns 404 updating or deleting a reminder that doesn't exist, or belongs to another user", async () => {
    const owner = await registerAndLogin("update-owner");
    const intruder = await registerAndLogin("update-intruder");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "general", schedules: ["0 20 * * *"] });

    const missing = await request(app)
      .patch("/api/reminders/00000000-0000-0000-0000-000000000000")
      .set(authed(owner.accessToken))
      .send({ enabled: false });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("REMINDER_NOT_FOUND");

    const wrongOwner = await request(app)
      .patch(`/api/reminders/${created.body.id}`)
      .set(authed(intruder.accessToken))
      .send({ enabled: false });
    expect(wrongOwner.status).toBe(404);

    const deleteWrongOwner = await request(app)
      .delete(`/api/reminders/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(deleteWrongOwner.status).toBe(404);
  });

  it("deletes a reminder for real (not archived)", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/reminders")
      .set(authed(accessToken))
      .send({ target: "general", schedules: ["0 20 * * *"] });

    const res = await request(app)
      .delete(`/api/reminders/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.reminder.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  // A temporary reminder - "nudge me every 30 minutes for the rest of today" - is an ordinary
  // reminder carrying an expiry. What these tests pin down is the part that isn't ordinary: who
  // resolves "end of today" (the server, against the user's *stored* timezone), what an expiry may
  // legally be, and how a temporary one coexists with the standing reminder for the same target.
  describe("temporary reminders", () => {
    it("resolves end-of-day to midnight tonight in the user's own stored timezone", async () => {
      const { accessToken, userId } = await registerAndLogin("expiry-timezone");
      // Deliberately not UTC, and deliberately far from it: if this were resolved against the
      // server's clock instead of the user's timezone, the instant would come out hours wrong -
      // which is the entire reason the client doesn't compute it.
      await prisma.user.update({ where: { id: userId }, data: { timezone: "Asia/Tokyo" } });

      const res = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 * * * *"], expiresAt: "end-of-day" });

      expect(res.status).toBe(201);
      const expiresAt = new Date(res.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Asserted independently of the helper that produced it: the instant one millisecond
      // *before* the expiry must still be today in Tokyo, and the expiry itself must already be
      // the next day there. That is what "midnight tonight, there" means, and it is true of no
      // other instant.
      const inTokyo = (date: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date);
      expect(inTokyo(new Date(expiresAt.getTime() - 1))).toBe(inTokyo(new Date()));
      expect(inTokyo(expiresAt)).not.toBe(inTokyo(new Date()));
    });

    it("rejects an expiry in the past, or further ahead than a temporary reminder should reach", async () => {
      const { accessToken } = await registerAndLogin("expiry-bounds");

      const past = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "general",
          schedules: ["0 9 * * *"],
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });
      expect(past.status).toBe(400);
      expect(past.body.error.details.expiresAt[0]).toMatch(/future/i);

      const tooFar = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "general",
          schedules: ["0 9 * * *"],
          expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(tooFar.status).toBe(400);
      expect(tooFar.body.error.details.expiresAt[0]).toMatch(/at most/i);

      const nonsense = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 9 * * *"], expiresAt: "tomorrow-ish" });
      expect(nonsense.status).toBe(400);
    });

    it("runs alongside the standing reminder for the same target, but only one at a time", async () => {
      const { accessToken } = await registerAndLogin("expiry-coexist");
      const categoryId = await createCategory(accessToken, "Water");

      const standing = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, schedules: ["0 9 * * *"] });
      expect(standing.status).toBe(201);
      expect(standing.body.expiresAt).toBeNull();

      // The whole point: this is an addition to the daily reminder above, not a replacement, so
      // it must not collide with it.
      const temporary = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "category",
          categoryId,
          schedules: ["0 * * * *"],
          expiresAt: "end-of-day",
        });
      expect(temporary.status).toBe(201);

      // A second live temporary one, however, is still one too many.
      const second = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "category",
          categoryId,
          schedules: ["0 */2 * * *"],
          expiresAt: "end-of-day",
        });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("TEMPORARY_REMINDER_ALREADY_EXISTS");

      // ... and so is a second standing one, exactly as before this feature existed.
      const secondStanding = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, schedules: ["0 21 * * *"] });
      expect(secondStanding.status).toBe(409);
      expect(secondStanding.body.error.code).toBe("REMINDER_ALREADY_EXISTS");
    });

    it("lets a new temporary reminder be created once the previous one has expired", async () => {
      const { accessToken, userId } = await registerAndLogin("expiry-finished");

      // An expired reminder still in the table - it lives for a day after lapsing (see
      // reminderScheduler.ts's sweep), and during that day it must not block a fresh one.
      await prisma.reminder.create({
        data: {
          userId,
          target: "GENERAL",
          schedules: ["0 * * * *"],
          expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 * * * *"], expiresAt: "end-of-day" });

      expect(res.status).toBe(201);
    });

    // The distinction docs/LESSONS-LEARNED.md exists for, tested on the edit path - the only place
    // it can ever bite: an omitted field and an explicit null are different requests.
    it("tells an omitted expiry apart from one explicitly cleared", async () => {
      const { accessToken } = await registerAndLogin("expiry-patch");

      const created = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 * * * *"], expiresAt: "end-of-day" });
      expect(created.status).toBe(201);
      const originalExpiry = created.body.expiresAt;
      expect(originalExpiry).not.toBeNull();

      // Not provided: the expiry must survive untouched while something else changes.
      const untouched = await request(app)
        .patch(`/api/reminders/${created.body.id}`)
        .set(authed(accessToken))
        .send({ enabled: false });
      expect(untouched.status).toBe(200);
      expect(untouched.body.expiresAt).toBe(originalExpiry);

      // Explicitly cleared: the reminder stops being temporary and becomes standing.
      const cleared = await request(app)
        .patch(`/api/reminders/${created.body.id}`)
        .set(authed(accessToken))
        .send({ expiresAt: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.expiresAt).toBeNull();
    });

    it("refuses to clear an expiry when that would leave two standing reminders for one target", async () => {
      const { accessToken } = await registerAndLogin("expiry-clear-conflict");
      const categoryId = await createCategory(accessToken, "Stretch");

      await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, schedules: ["0 9 * * *"] });
      const temporary = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "category",
          categoryId,
          schedules: ["0 * * * *"],
          expiresAt: "end-of-day",
        });

      const cleared = await request(app)
        .patch(`/api/reminders/${temporary.body.id}`)
        .set(authed(accessToken))
        .send({ expiresAt: null });

      expect(cleared.status).toBe(409);
      expect(cleared.body.error.code).toBe("REMINDER_ALREADY_EXISTS");
    });
  });

  // "Remind me again in four hours", asked right after logging something.
  //
  // These tests have a real clock problem to solve: the endpoint works in the caller's own local
  // time, and the suite can run at any hour. Rather than freezing time (which would take the
  // database's own now() out of step with the app's) each test picks a timezone in which it is
  // currently the hour that test needs - early evening for the ones that need room before
  // midnight, late night for the one about crossing it. Every assertion is then made against that
  // same timezone's clock, never against a hardcoded hour.
  describe("follow-up reminders", () => {
    const ZONES = [
      "Pacific/Kiritimati",
      "Pacific/Auckland",
      "Asia/Tokyo",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "Pacific/Midway",
    ];

    function localMinutes(timeZone: string) {
      const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date())
        .split(":")
        .map(Number);
      return hour * 60 + minute;
    }

    // The zone where the day is least far along - guaranteed to leave room for a follow-up that
    // still lands today. The spread of offsets above covers more than 24 hours, so there is always
    // one somewhere near the start of its day.
    function earliestZone() {
      return ZONES.map((zone) => ({ zone, minutes: localMinutes(zone) })).sort(
        (a, b) => a.minutes - b.minutes,
      )[0];
    }

    // ...and the zone furthest through its day, for the case that has to cross midnight.
    function latestZone() {
      return ZONES.map((zone) => ({ zone, minutes: localMinutes(zone) })).sort(
        (a, b) => b.minutes - a.minutes,
      )[0];
    }

    async function userInZone(label: string, zone: string) {
      const session = await registerAndLogin(label);
      await prisma.user.update({ where: { id: session.userId }, data: { timezone: zone } });
      return session;
    }

    it("creates a one-shot reminder at the right local time, expiring tonight", async () => {
      const { zone, minutes } = earliestZone();
      const { accessToken } = await userInZone("follow-up-create", zone);
      const categoryId = await createCategory(accessToken, "Diazepam");

      const res = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, inMinutes: 120 });

      expect(res.status).toBe(201);

      const expected = minutes + 120;
      const hour = Math.floor(expected / 60);
      const minute = expected % 60;
      // Asserted to the minute against that zone's own clock, so a wrong timezone (or wrong
      // arithmetic) shows up as a concrete time rather than a vague "something was created".
      expect(res.body.schedules).toEqual([`${minute} ${hour} * * *`]);
      expect(res.body.firesAtLocal).toBe(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );

      // Must not stop when logged: the user has *just* logged this category, so a reminder that
      // stopped on logging would be silenced before it ever fired. This is precisely why the stop
      // condition had to become an explicit field before this endpoint could exist at all.
      expect(res.body.stopsWhenLogged).toBe(false);
      expect(res.body.expiresAt).not.toBeNull();
      expect(res.body.replacedExisting).toBe(false);
    });

    it("replaces a temporary reminder already running for the same target", async () => {
      const { zone } = earliestZone();
      const { accessToken } = await userInZone("follow-up-replace", zone);
      const categoryId = await createCategory(accessToken, "Water");

      const repeater = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({
          target: "category",
          categoryId,
          schedules: ["0 */2 * * *"],
          expiresAt: "end-of-day",
        });
      expect(repeater.status).toBe(201);

      const followUp = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, inMinutes: 60 });

      expect(followUp.status).toBe(201);
      expect(followUp.body.replacedExisting).toBe(true);
      // Replaced, not added alongside - "one live temporary per target" still holds afterwards.
      expect(await prisma.reminder.findUnique({ where: { id: repeater.body.id } })).toBeNull();
    });

    it("leaves the standing reminder for the same category completely alone", async () => {
      const { zone } = earliestZone();
      const { accessToken } = await userInZone("follow-up-standing", zone);
      const categoryId = await createCategory(accessToken, "Stretch");

      const standing = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, schedules: ["0 9 * * *"] });

      const followUp = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "category", categoryId, inMinutes: 60 });
      expect(followUp.status).toBe(201);

      const after = await prisma.reminder.findUnique({ where: { id: standing.body.id } });
      expect(after).not.toBeNull();
      expect(after?.expiresAt).toBeNull();
      expect(after?.stopsWhenLogged).toBe(true);
    });

    it("refuses a follow-up that would land tomorrow rather than firing it immediately", async () => {
      const { zone, minutes } = latestZone();
      const { accessToken } = await userInZone("follow-up-midnight", zone);

      // Enough to cross midnight there, capped at the endpoint's own ceiling. The zone list spans
      // more than a full day, so one of them is always late enough for this to fit under the cap.
      const inMinutes = Math.min(24 * 60 - minutes + 30, 12 * 60);
      if (minutes + inMinutes < 24 * 60) {
        throw new Error(`No zone late enough to cross midnight (latest was ${zone})`);
      }

      const res = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "general", inMinutes });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("FOLLOW_UP_PAST_MIDNIGHT");
      // Nothing was created - a rejected follow-up must not leave a reminder behind.
      const list = await request(app).get("/api/reminders").set(authed(accessToken));
      expect(list.body).toEqual([]);
    });

    it("rejects an interval below the scheduler's own resolution, or beyond half a day", async () => {
      const { accessToken } = await registerAndLogin("follow-up-bounds");

      const tooSoon = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "general", inMinutes: 5 });
      expect(tooSoon.status).toBe(400);

      const tooLate = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "general", inMinutes: 13 * 60 });
      expect(tooLate.status).toBe(400);
    });

    it("404s a follow-up for a category the caller cannot see", async () => {
      const { accessToken } = await registerAndLogin("follow-up-owner");
      const other = await registerAndLogin("follow-up-other");
      const theirCategory = await createCategory(other.accessToken, "Private");

      const res = await request(app)
        .post("/api/reminders/follow-up")
        .set(authed(accessToken))
        .send({ target: "category", categoryId: theirCategory, inMinutes: 60 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
    });

    it("401s without an access token", async () => {
      const res = await request(app)
        .post("/api/reminders/follow-up")
        .send({ target: "general", inMinutes: 60 });
      expect(res.status).toBe(401);
    });
  });

  describe("stop condition", () => {
    it("defaults to stopping when logged, and can be set and changed", async () => {
      const { accessToken } = await registerAndLogin("stop-condition");

      const created = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 9 * * *"] });
      expect(created.body.stopsWhenLogged).toBe(true);

      const changed = await request(app)
        .patch(`/api/reminders/${created.body.id}`)
        .set(authed(accessToken))
        .send({ stopsWhenLogged: false });
      expect(changed.status).toBe(200);
      expect(changed.body.stopsWhenLogged).toBe(false);

      // Editing something else must not quietly reset it - the same not-provided-means-untouched
      // rule the expiry tests above pin down.
      const other = await request(app)
        .patch(`/api/reminders/${created.body.id}`)
        .set(authed(accessToken))
        .send({ schedules: ["0 10 * * *"] });
      expect(other.body.stopsWhenLogged).toBe(false);
    });

    it("can be set at creation time", async () => {
      const { accessToken } = await registerAndLogin("stop-condition-create");

      const res = await request(app)
        .post("/api/reminders")
        .set(authed(accessToken))
        .send({ target: "general", schedules: ["0 9 * * *"], stopsWhenLogged: false });

      expect(res.status).toBe(201);
      expect(res.body.stopsWhenLogged).toBe(false);
    });
  });

  it("archiving a category disables (not deletes) every reminder targeting it, across users", async () => {
    const owner = await registerAndLogin("archive-owner");
    const other = await registerAndLogin("archive-other");
    const categoryId = await createCategory(owner.accessToken, "Shared water tracker");

    const ownerReminder = await request(app)
      .post("/api/reminders")
      .set(authed(owner.accessToken))
      .send({ target: "category", categoryId, schedules: ["0 9 * * *"] });
    expect(ownerReminder.status).toBe(201);

    // A second user's own reminder against the same category, created directly via Prisma (not
    // the real route) since a personal category is only visible to its owner - a system-wide
    // category is the realistic case where a different user's own reminder would exist against
    // it, but the archive route's disabling side effect should cover *any* reminder row
    // referencing the category id regardless of how it was created, so this still exercises the
    // "across users" part of the behavior directly.
    const otherReminder = await prisma.reminder.create({
      data: { userId: other.userId, target: "CATEGORY", categoryId, schedules: ["0 10 * * *"] },
    });

    await request(app).delete(`/api/categories/${categoryId}`).set(authed(owner.accessToken));

    const [ownerReminderAfter, otherReminderAfter] = await Promise.all([
      prisma.reminder.findUnique({ where: { id: ownerReminder.body.id } }),
      prisma.reminder.findUnique({ where: { id: otherReminder.id } }),
    ]);
    expect(ownerReminderAfter?.enabled).toBe(false);
    expect(otherReminderAfter?.enabled).toBe(false);
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.reminderSend.deleteMany({ where: { reminder: { userId: { in: userIds } } } });
  await prisma.reminder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

// 2026-08-30 is a Sunday. 14:05 UTC gives every test both an already-past moment (for "overdue")
// and a not-yet-arrived one (for "upcoming") on the same calendar day - the same anchor
// remindersRecent.test.ts already uses, for the same reason.
const NOW = "2026-08-30T14:05:00.000Z";
const TODAY = "2026-08-30";

const app = createApp();

function uniqueEmail(label: string) {
  return `vitest-tasks-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const createdEmails: string[] = [];

async function registerAndLogin(label: string, timezone = "UTC") {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  await request(app).post("/api/auth/register").send({ email, password: "Sup3rSecret" });
  await prisma.user.update({ where: { email }, data: { timezone } });
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/tasks", () => {
  it("401s without an access token", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "x", dueAt: NOW });
    expect(res.status).toBe(401);
  });

  it("creates a task with a title, optional notes, and a due time", async () => {
    const { accessToken } = await registerAndLogin("create");

    const res = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Phone the vet", notes: "ask about the booster", dueAt: `${TODAY}T18:00:00.000Z` });

    expect(res.status).toBe(201);
    // The full response shape - not just the fields the create request itself sent - matching
    // exactly what GET /api/tasks already returns per row (id, title, notes, date, time, dueAt,
    // state, when; deliberately never userId, doneAt, notifiedAt or createdAt - none of them are
    // read by the frontend's own ApiTask type, and doneAt in particular is redundant with `state`
    // already saying "done"). A real bug (found by running this in a real browser, not by an
    // earlier version of this test) had POST/PATCH silently returning the bare Prisma row instead
    // - with none of `state`/`date`/`time`/`when` computed at all - which nothing here caught
    // because nothing asserted they existed. toEqual (not toMatchObject) is deliberate too: it
    // would also catch a stray extra field (doneAt, userId, ...) creeping back in.
    expect(res.body).toEqual({
      id: expect.any(String),
      title: "Phone the vet",
      notes: "ask about the booster",
      dueAt: `${TODAY}T18:00:00.000Z`,
      date: TODAY,
      time: "18:00",
      state: "upcoming",
      when: "future",
    });
  });

  it("creates a task with no notes at all", async () => {
    const { accessToken } = await registerAndLogin("no-notes");

    const res = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Pick up parcel", dueAt: `${TODAY}T18:00:00.000Z` });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
  });

  it("rejects an empty or missing title", async () => {
    const { accessToken } = await registerAndLogin("empty-title");

    const empty = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "   ", dueAt: `${TODAY}T18:00:00.000Z` });
    expect(empty.status).toBe(400);

    const missing = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ dueAt: `${TODAY}T18:00:00.000Z` });
    expect(missing.status).toBe(400);
  });

  it("rejects a dueAt that isn't a valid ISO datetime", async () => {
    const { accessToken } = await registerAndLogin("bad-due");

    const res = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "x", dueAt: "not a date" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks", () => {
  it("401s without an access token", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("rejects any days value that isn't 1, 3 or 7", async () => {
    const { accessToken } = await registerAndLogin("bad-days");
    const res = await request(app).get("/api/tasks?days=30").set(authed(accessToken));
    expect(res.status).toBe(400);
  });

  it("reports upcoming, overdue, and done for tasks around the current moment", async () => {
    const { accessToken } = await registerAndLogin("states");

    await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Later today", dueAt: `${TODAY}T21:00:00.000Z` });
    await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Already late", dueAt: `${TODAY}T09:00:00.000Z` });
    const doneRes = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Finished", dueAt: `${TODAY}T08:00:00.000Z` });
    await request(app)
      .patch(`/api/tasks/${doneRes.body.id}`)
      .set(authed(accessToken))
      .send({ done: true });

    const res = await request(app).get("/api/tasks?days=1").set(authed(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.today).toBe(TODAY);
    expect(res.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Later today", state: "upcoming", when: "future" }),
        expect.objectContaining({ title: "Already late", state: "overdue", when: "past" }),
        // "Finished" was due at 08:00, before "now" (14:05) - done and past both agree here, but
        // `when` is its own comparison, not derived from `state`: a task completed ahead of its
        // own due time would still be "done", yet its dueAt could sit on either side of now.
        expect.objectContaining({ title: "Finished", state: "done", when: "past" }),
      ]),
    );
  });

  it("resolves date and time in the caller's own timezone", async () => {
    const { accessToken } = await registerAndLogin("tz", "America/Los_Angeles");

    // 21:00 UTC is 14:00 the same day in Los Angeles.
    const res = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "x", dueAt: `${TODAY}T21:00:00.000Z` });
    expect(res.status).toBe(201);

    const list = await request(app).get("/api/tasks").set(authed(accessToken));
    expect(list.body.tasks).toEqual([
      expect.objectContaining({ date: TODAY, time: "14:00" }),
    ]);
  });

  it("only returns tasks whose due date falls inside the requested window", async () => {
    const { accessToken } = await registerAndLogin("window");

    await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Far future", dueAt: "2026-09-10T12:00:00.000Z" });
    await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "Today", dueAt: `${TODAY}T12:00:00.000Z` });

    const res = await request(app).get("/api/tasks?days=1").set(authed(accessToken));

    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Today"]);
  });

  it("never shows another user's tasks", async () => {
    const mine = await registerAndLogin("mine");
    const theirs = await registerAndLogin("theirs");
    await request(app)
      .post("/api/tasks")
      .set(authed(theirs.accessToken))
      .send({ title: "Not yours", dueAt: `${TODAY}T12:00:00.000Z` });

    const res = await request(app).get("/api/tasks").set(authed(mine.accessToken));

    expect(res.body.tasks).toEqual([]);
  });

  it("returns an empty list for an account with no tasks at all", async () => {
    const { accessToken } = await registerAndLogin("none");
    const res = await request(app).get("/api/tasks?days=7").set(authed(accessToken));
    expect(res.body).toMatchObject({ timezone: "UTC", today: TODAY, tasks: [] });
  });
});

describe("PATCH /api/tasks/:id", () => {
  async function createTask(accessToken: string, overrides: { title?: string; dueAt?: string } = {}) {
    const res = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({
        title: overrides.title ?? "Original title",
        dueAt: overrides.dueAt ?? `${TODAY}T18:00:00.000Z`,
      });
    return res.body.id as string;
  }

  it("marks a task done, and reopens it - reflected in `state`, the response's own signal for it", async () => {
    const { accessToken } = await registerAndLogin("mark-done");
    const id = await createTask(accessToken);

    const done = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ done: true });
    expect(done.status).toBe(200);
    // `state` is the one field the response actually carries for this - there is no `doneAt` in
    // it at all (see the POST test's own comment on why: GET's own list never had one either, and
    // it would be redundant with `state` already saying "done"). PATCH used to return the bare
    // Prisma row instead, with no `state` computed at all - real symptom, found in a real browser
    // rather than by an earlier version of this test: the "done"/"reopened" toast was wrong on
    // every single toggle. See routes/tasks.ts's own serializeTask and
    // docs/log/51-one-off-tasks.md.
    expect(done.body.state).toBe("done");

    const reopened = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ done: false });
    expect(reopened.body.state).toBe("upcoming");
  });

  it("renames a task and edits its notes, clearing notes with an explicit null", async () => {
    const { accessToken } = await registerAndLogin("rename");
    const id = await createTask(accessToken);

    const withNotes = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ title: "Renamed", notes: "a note" });
    expect(withNotes.body).toMatchObject({ title: "Renamed", notes: "a note" });

    const cleared = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ notes: null });
    expect(cleared.body.notes).toBeNull();
    // Not provided vs explicitly cleared - the title from the previous PATCH must survive one
    // that only touches notes.
    expect(cleared.body.title).toBe("Renamed");
  });

  it("reschedules a task, and a reschedule clears notifiedAt so it can notify again", async () => {
    const { accessToken } = await registerAndLogin("reschedule");
    const id = await createTask(accessToken);
    await prisma.task.update({ where: { id }, data: { notifiedAt: new Date(NOW) } });

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ dueAt: `${TODAY}T20:00:00.000Z` });

    expect(res.body.dueAt).toBe(`${TODAY}T20:00:00.000Z`);
    const stored = await prisma.task.findUnique({ where: { id } });
    expect(stored?.notifiedAt).toBeNull();
  });

  it("returns 404 for a task that doesn't exist, or belongs to another user", async () => {
    const owner = await registerAndLogin("patch-owner");
    const intruder = await registerAndLogin("patch-intruder");
    const id = await createTask(owner.accessToken);

    const missing = await request(app)
      .patch("/api/tasks/does-not-exist")
      .set(authed(owner.accessToken))
      .send({ done: true });
    expect(missing.status).toBe(404);

    const intruderRes = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(intruder.accessToken))
      .send({ done: true });
    expect(intruderRes.status).toBe(404);
  });

  it("rejects clearing the title to empty", async () => {
    const { accessToken } = await registerAndLogin("empty-rename");
    const id = await createTask(accessToken);

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .set(authed(accessToken))
      .send({ title: "   " });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("deletes a task owned by the authenticated user", async () => {
    const { accessToken } = await registerAndLogin("delete");
    const created = await request(app)
      .post("/api/tasks")
      .set(authed(accessToken))
      .send({ title: "x", dueAt: `${TODAY}T18:00:00.000Z` });

    const res = await request(app)
      .delete(`/api/tasks/${created.body.id}`)
      .set(authed(accessToken));
    expect(res.status).toBe(200);

    const stillThere = await prisma.task.findUnique({ where: { id: created.body.id } });
    expect(stillThere).toBeNull();
  });

  it("returns 404 for another user's task, without deleting it", async () => {
    const owner = await registerAndLogin("delete-owner");
    const intruder = await registerAndLogin("delete-intruder");
    const created = await request(app)
      .post("/api/tasks")
      .set(authed(owner.accessToken))
      .send({ title: "x", dueAt: `${TODAY}T18:00:00.000Z` });

    const res = await request(app)
      .delete(`/api/tasks/${created.body.id}`)
      .set(authed(intruder.accessToken));
    expect(res.status).toBe(404);

    const stillThere = await prisma.task.findUnique({ where: { id: created.body.id } });
    expect(stillThere).not.toBeNull();
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } } });
  const userIds = users.map((u) => u.id);
  await prisma.task.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

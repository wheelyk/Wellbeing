import { describe, it, expect } from "vitest";
import {
  describeRun,
  describeTask,
  groupRunsByDay,
  hasLoggedWithinDays,
  mergeRuns,
  mergeWithTasks,
  orderRuns,
  splitAroundNow,
  stateLabel,
  taskStateLabel,
  timelineRowAction,
  type RecentRun,
  type TaskRun,
  type TimelineRun,
  type UpcomingRun,
} from "./timeline";

const recentRun = (over: Partial<RecentRun> = {}): RecentRun => ({
  date: "2026-08-30",
  time: "09:00",
  reminderId: "r1",
  target: "category",
  categoryId: "cat-1",
  category: { name: "Sertraline", icon: "💊" },
  state: "logged",
  logId: "log-1",
  ...over,
});

const upcomingRun = (over: Partial<UpcomingRun> = {}): UpcomingRun => ({
  date: "2026-08-30",
  time: "21:00",
  reminderId: "r2",
  target: "category",
  categoryId: "cat-2",
  category: { name: "Anxiety", icon: "🧠" },
  state: "scheduled",
  ...over,
});

describe("mergeRuns", () => {
  it("puts every recent run before every upcoming run, tagged past and future", () => {
    const merged = mergeRuns([recentRun()], [upcomingRun()]);

    expect(merged.map((r) => [r.reminderId, r.when])).toEqual([
      ["r1", "past"],
      ["r2", "future"],
    ]);
  });

  it("does not sort - the caller's own chronological order from each endpoint is preserved", () => {
    const past = [
      recentRun({ time: "07:00", reminderId: "a" }),
      recentRun({ time: "09:00", reminderId: "b" }),
    ];
    const future = [
      upcomingRun({ time: "21:00", reminderId: "c" }),
      upcomingRun({ time: "23:00", reminderId: "d" }),
    ];

    expect(mergeRuns(past, future).map((r) => r.reminderId)).toEqual(["a", "b", "c", "d"]);
  });

  it("merges an empty side without error", () => {
    expect(mergeRuns([], [upcomingRun()])).toHaveLength(1);
    expect(mergeRuns([recentRun()], [])).toHaveLength(1);
    expect(mergeRuns([], [])).toEqual([]);
  });
});

const taskRun = (over: Partial<TaskRun> = {}): TaskRun => ({
  kind: "task",
  id: "task-1",
  title: "Phone the vet",
  notes: null,
  date: "2026-08-30",
  time: "12:30",
  dueAt: "2026-08-30T12:30:00.000Z",
  state: "upcoming",
  when: "future",
  ...over,
});

describe("mergeWithTasks", () => {
  it("interleaves reminder rows and tasks by date and time, not by which array they came from", () => {
    const runs = [
      mergeRuns([], [upcomingRun({ time: "12:00", reminderId: "r" })])[0],
      mergeRuns([], [upcomingRun({ time: "18:00", reminderId: "r2" })])[0],
    ];
    const tasks = [taskRun({ id: "t1", time: "09:00" }), taskRun({ id: "t2", time: "15:00" })];

    const merged = mergeWithTasks(runs, tasks);

    expect(merged.map((entry) => ("reminderId" in entry ? entry.reminderId : entry.id))).toEqual([
      "t1",
      "r",
      "t2",
      "r2",
    ]);
  });

  it("sorts across different days too, not just within one", () => {
    const runs = mergeRuns([], [upcomingRun({ date: "2026-09-01", reminderId: "later" })]);
    const tasks = [taskRun({ id: "sooner", date: "2026-08-30" })];

    const merged = mergeWithTasks(runs, tasks);

    expect(merged.map((entry) => ("reminderId" in entry ? entry.reminderId : entry.id))).toEqual([
      "sooner",
      "later",
    ]);
  });

  it("keeps runs before tasks when they land on the exact same date and time", () => {
    const runs = mergeRuns([], [upcomingRun({ time: "12:30", reminderId: "r" })]);
    const tasks = [taskRun({ id: "t", time: "12:30" })];

    const merged = mergeWithTasks(runs, tasks);

    expect(merged.map((entry) => entry.kind)).toEqual(["reminder", "task"]);
  });

  it("merges an empty side without error", () => {
    expect(mergeWithTasks([], [taskRun()])).toHaveLength(1);
    expect(mergeWithTasks(mergeRuns([], [upcomingRun()]), [])).toHaveLength(1);
    expect(mergeWithTasks([], [])).toEqual([]);
  });
});

describe("describeTask", () => {
  it("shows the notes when there are any", () => {
    expect(describeTask(taskRun({ notes: "ask about the booster" }))).toBe("ask about the booster");
  });

  it("shows nothing for a task with no notes", () => {
    expect(describeTask(taskRun({ notes: null }))).toBeNull();
  });
});

describe("taskStateLabel", () => {
  it("says nothing for an ordinary upcoming task", () => {
    expect(taskStateLabel("upcoming")).toBeNull();
  });

  it("labels an overdue task plainly", () => {
    expect(taskStateLabel("overdue")).toBe("Overdue");
  });

  it("labels a done task plainly", () => {
    expect(taskStateLabel("done")).toBe("Done");
  });
});

describe("groupRunsByDay", () => {
  const run = (over: Partial<TimelineRun> = {}): TimelineRun => ({
    kind: "reminder",
    date: "2026-08-30",
    time: "09:00",
    reminderId: "r1",
    target: "category",
    categoryId: "cat-1",
    category: { name: "Sertraline", icon: "💊" },
    state: "logged",
    when: "past",
    logId: "log-1",
    ...over,
  });

  // The point of the merge: a day that has both a past (recent) and a future (upcoming) row for
  // the same date collapses into one group, not two - which is what lets the panel draw a single
  // NOW divider inside "Today" rather than two separate "Today" sections.
  it("merges a day's past and future rows into a single group", () => {
    const days = groupRunsByDay(
      [
        run({ when: "past", time: "09:00" }),
        run({ when: "future", time: "21:00", reminderId: "r2" }),
      ],
      "2026-08-30",
    );

    expect(days).toHaveLength(1);
    expect(days[0].runs.map((r) => r.when)).toEqual(["past", "future"]);
  });

  it("names yesterday, today and tomorrow, and dates everything further out", () => {
    const days = groupRunsByDay(
      [
        run({ date: "2026-08-28" }),
        run({ date: "2026-08-29", reminderId: "r2" }),
        run({ date: "2026-08-30", reminderId: "r3" }),
        run({ date: "2026-08-31", reminderId: "r4" }),
        run({ date: "2026-09-01", reminderId: "r5" }),
      ],
      "2026-08-30",
    );

    expect(days.map((d) => d.label)).toEqual([
      "Fri 28 August",
      "Yesterday",
      "Today",
      "Tomorrow",
      "Tue 1 September",
    ]);
  });

  it("crosses a month boundary in both directions", () => {
    const days = groupRunsByDay([run({ date: "2026-08-31" })], "2026-09-01");
    expect(days[0].label).toBe("Yesterday");
  });

  it("has nothing to group when there is nothing due", () => {
    expect(groupRunsByDay([], "2026-08-30")).toEqual([]);
  });
});

describe("describeRun", () => {
  const run = (over: Partial<TimelineRun> = {}): TimelineRun => ({
    kind: "reminder",
    date: "2026-08-30",
    time: "09:00",
    reminderId: "r1",
    target: "category",
    categoryId: "cat-1",
    category: { name: "Sertraline", icon: "💊" },
    state: "scheduled",
    when: "future",
    logId: null,
    ...over,
  });

  it("says nothing about an ordinary scheduled or logged run", () => {
    expect(describeRun(run({ state: "scheduled" }))).toBeNull();
    expect(describeRun(run({ state: "logged", when: "past" }))).toBeNull();
    expect(stateLabel("scheduled")).toBeNull();
    expect(stateLabel("logged")).toBe("Logged");
  });

  // "Missed" is the one state that exists only looking backward, and it has to say plainly that
  // nothing was logged - not just "missed", which says nothing about what the reminder was for.
  it("explains a missed run", () => {
    expect(describeRun(run({ state: "missed", when: "past" }))).toBe("No dose logged that day");
  });

  // "Logged" only needs explaining looking forward: an upcoming slot silenced by an earlier log
  // today is worth saying plainly. A past row that reads "logged" already carries the whole
  // explanation in its pill and its place in the list - repeating it would be redundant.
  it("explains a logged run only when it is a future one being silenced", () => {
    expect(describeRun(run({ state: "logged", when: "future" }))).toBe(
      "Already logged, so this one won't fire",
    );
    expect(describeRun(run({ state: "logged", when: "past" }))).toBeNull();
  });

  it("says when a held run will actually arrive", () => {
    expect(describeRun(run({ state: "held", deliveredAt: "08:00" }))).toBe(
      "Quiet hours — arrives at 08:00",
    );
    expect(describeRun(run({ state: "held" }))).toBe("Quiet hours");
  });

  it("explains a paused run", () => {
    expect(describeRun(run({ state: "paused" }))).toBe("This reminder is switched off");
  });

  it("says how many times a collapsed cadence repeats, and how late it runs", () => {
    expect(describeRun(run({ repeatCount: 11, lastTime: "23:00" }))).toBe("11 times, until 23:00");
  });

  it("joins the repeat count and the state when both apply", () => {
    expect(
      describeRun(run({ repeatCount: 4, lastTime: "23:00", state: "held", deliveredAt: "08:00" })),
    ).toBe("4 times, until 23:00 · Quiet hours — arrives at 08:00");
  });

  it("ignores a repeatCount of exactly one", () => {
    expect(describeRun(run({ repeatCount: 1 }))).toBeNull();
  });
});

describe("orderRuns", () => {
  const runs: TimelineRun[] = [
    { ...recentRun({ reminderId: "a" }), kind: "reminder", when: "past", logId: null },
    { ...recentRun({ reminderId: "b" }), kind: "reminder", when: "past", logId: null },
    { ...upcomingRun({ reminderId: "c" }), kind: "reminder", when: "future", logId: null },
  ];

  it("leaves the order untouched for oldest first", () => {
    expect(orderRuns(runs, "oldest").map((r) => r.reminderId)).toEqual(["a", "b", "c"]);
  });

  it("reverses the whole list for newest first", () => {
    expect(orderRuns(runs, "newest").map((r) => r.reminderId)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the array it was given", () => {
    const original = [...runs];
    orderRuns(runs, "newest");
    expect(runs).toEqual(original);
  });
});

describe("splitAroundNow", () => {
  const past = (id: string): TimelineRun => ({
    ...recentRun({ reminderId: id }),
    kind: "reminder",
    when: "past",
    logId: null,
  });
  const future = (id: string): TimelineRun => ({
    ...upcomingRun({ reminderId: id }),
    kind: "reminder",
    when: "future",
    logId: null,
  });

  it("puts past above and future below when reading oldest first", () => {
    const { above, below } = splitAroundNow([past("a"), future("b")], "oldest");
    expect(above.map((r) => r.reminderId)).toEqual(["a"]);
    expect(below.map((r) => r.reminderId)).toEqual(["b"]);
  });

  // The point of the toggle: newest-first reads top-to-bottom as "soonest/most recent first," so
  // within Today that means future above NOW and past below it - the mirror image of oldest-first,
  // not merely each half internally reversed.
  it("puts future above and past below when reading newest first", () => {
    const { above, below } = splitAroundNow([past("a"), future("b")], "newest");
    expect(above.map((r) => r.reminderId)).toEqual(["b"]);
    expect(below.map((r) => r.reminderId)).toEqual(["a"]);
  });
});

describe("hasLoggedWithinDays", () => {
  const TODAY = "2026-08-30";
  const loggedOn = (date: string): RecentRun => recentRun({ date, state: "logged" });

  it("is true for today itself, at every window size", () => {
    expect(hasLoggedWithinDays([loggedOn(TODAY)], TODAY, 1)).toBe(true);
    expect(hasLoggedWithinDays([loggedOn(TODAY)], TODAY, 3)).toBe(true);
    expect(hasLoggedWithinDays([loggedOn(TODAY)], TODAY, 7)).toBe(true);
  });

  // 3 days means today plus the two before it - the same "N days, counting backward" convention
  // TIMELINE_RANGES already documents.
  it("is true right at the edge of the window and false just past it", () => {
    expect(hasLoggedWithinDays([loggedOn("2026-08-28")], TODAY, 3)).toBe(true);
    expect(hasLoggedWithinDays([loggedOn("2026-08-27")], TODAY, 3)).toBe(false);
  });

  it("ignores a missed or paused row, even on today", () => {
    expect(hasLoggedWithinDays([recentRun({ date: TODAY, state: "missed" })], TODAY, 1)).toBe(
      false,
    );
    expect(hasLoggedWithinDays([recentRun({ date: TODAY, state: "paused" })], TODAY, 1)).toBe(
      false,
    );
  });

  it("is false for an empty list", () => {
    expect(hasLoggedWithinDays([], TODAY, 7)).toBe(false);
  });
});

describe("timelineRowAction", () => {
  const run = (over: Partial<TimelineRun> = {}): TimelineRun => ({
    kind: "reminder",
    date: "2026-08-30",
    time: "09:00",
    reminderId: "r1",
    target: "category",
    categoryId: "cat-1",
    category: { name: "Sertraline", icon: "💊" },
    state: "scheduled",
    when: "future",
    logId: null,
    ...over,
  });

  it("edits the exact log behind a past, CATEGORY-target logged row", () => {
    expect(run({ when: "past", state: "logged", logId: "log-9" }).logId).toBe("log-9");
    expect(timelineRowAction(run({ when: "past", state: "logged", logId: "log-9" }))).toEqual({
      type: "edit",
      logId: "log-9",
    });
  });

  // The one row with genuinely nothing to do: already satisfied, and not something that "happened"
  // yet to edit - see describeState's own reasoning for the same distinction.
  it("offers nothing for a future row already logged", () => {
    expect(timelineRowAction(run({ when: "future", state: "logged", logId: null }))).toBeNull();
  });

  it("offers a locked add for a due, missed, held or paused row naming a category", () => {
    for (const state of ["scheduled", "missed", "held", "paused"] as const) {
      expect(timelineRowAction(run({ state, categoryId: "cat-1" }))).toEqual({
        type: "add",
        categoryId: "cat-1",
      });
    }
  });

  it("offers an unlocked add for a GENERAL row, whether or not it is logged", () => {
    expect(timelineRowAction(run({ state: "scheduled", categoryId: null }))).toEqual({
      type: "add",
      categoryId: null,
    });
    // A GENERAL reminder's "logged" match is real but ambiguous (see RecentRun's own comment) -
    // no exact entry to edit, but logging something new is still a valid action.
    expect(
      timelineRowAction(run({ when: "past", state: "logged", categoryId: null, logId: null })),
    ).toEqual({ type: "add", categoryId: null });
  });
});

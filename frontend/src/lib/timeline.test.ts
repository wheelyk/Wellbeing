import { describe, it, expect } from "vitest";
import {
  describeRun,
  groupRunsByDay,
  mergeRuns,
  stateLabel,
  type RecentRun,
  type TimelineRun,
  type UpcomingRun,
} from "./timeline";

const recentRun = (over: Partial<RecentRun> = {}): RecentRun => ({
  date: "2026-08-30",
  time: "09:00",
  reminderId: "r1",
  target: "category",
  category: { name: "Sertraline", icon: "💊" },
  state: "logged",
  ...over,
});

const upcomingRun = (over: Partial<UpcomingRun> = {}): UpcomingRun => ({
  date: "2026-08-30",
  time: "21:00",
  reminderId: "r2",
  target: "category",
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

describe("groupRunsByDay", () => {
  const run = (over: Partial<TimelineRun> = {}): TimelineRun => ({
    date: "2026-08-30",
    time: "09:00",
    reminderId: "r1",
    target: "category",
    category: { name: "Sertraline", icon: "💊" },
    state: "logged",
    when: "past",
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
    date: "2026-08-30",
    time: "09:00",
    reminderId: "r1",
    target: "category",
    category: { name: "Sertraline", icon: "💊" },
    state: "scheduled",
    when: "future",
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

import { describe, it, expect } from "vitest";
import { describeRun, groupRunsByDay, stateLabel, type UpcomingRun } from "./upcoming";

const run = (over: Partial<UpcomingRun> = {}): UpcomingRun => ({
  date: "2026-08-30",
  time: "09:00",
  reminderId: "r1",
  target: "category",
  category: { name: "Sertraline", icon: "💊" },
  state: "scheduled",
  ...over,
});

describe("groupRunsByDay", () => {
  // "Today" is taken from the response, never from the browser - the account's timezone is the
  // server's to know, and every other date in this app follows the same rule.
  it("names today and tomorrow, and dates everything after", () => {
    const days = groupRunsByDay(
      [
        run({ date: "2026-08-30" }),
        run({ date: "2026-08-31", reminderId: "r2" }),
        run({ date: "2026-09-01", reminderId: "r3" }),
      ],
      "2026-08-30",
    );

    expect(days.map((d) => d.label)).toEqual(["Today", "Tomorrow", "Tue 1 September"]);
  });

  it("keeps the server's order rather than re-sorting", () => {
    const days = groupRunsByDay(
      [
        run({ time: "07:30" }),
        run({ time: "09:00", reminderId: "r2" }),
        run({ date: "2026-08-31", time: "07:30", reminderId: "r3" }),
      ],
      "2026-08-30",
    );

    expect(days).toHaveLength(2);
    expect(days[0].runs.map((r) => r.time)).toEqual(["07:30", "09:00"]);
    expect(days[1].runs.map((r) => r.time)).toEqual(["07:30"]);
  });

  it("crosses a month boundary when working out tomorrow", () => {
    const days = groupRunsByDay([run({ date: "2026-09-01" })], "2026-08-31");
    expect(days[0].label).toBe("Tomorrow");
  });

  it("has nothing to group when there is nothing due", () => {
    expect(groupRunsByDay([], "2026-08-30")).toEqual([]);
  });
});

describe("describeRun", () => {
  // Held is not lost. Saying when it will actually arrive is the entire point of the state - "held"
  // on its own would read as "you won't get this".
  it("says when a held reminder will actually arrive", () => {
    expect(describeRun(run({ state: "held", deliveredAt: "08:00" }))).toBe(
      "Quiet hours — arrives at 08:00",
    );
  });

  it("still explains a held reminder with no delivery time", () => {
    expect(describeRun(run({ state: "held" }))).toBe("Quiet hours");
  });

  it("explains why a run will not fire", () => {
    expect(describeRun(run({ state: "logged" }))).toMatch(/won't fire/);
    expect(describeRun(run({ state: "paused" }))).toMatch(/switched off/);
  });

  // An ordinary due reminder needs no explanation, and a line saying "scheduled" under every row
  // would be noise on the common case.
  it("says nothing about an ordinary scheduled run", () => {
    expect(describeRun(run())).toBeNull();
    expect(stateLabel("scheduled")).toBeNull();
  });

  // A collapsed row stands for many slots, so "13:00" alone would understate it - the count and
  // the last time are what make one row as informative as the eleven it replaced.
  it("says how many times a collapsed cadence repeats, and how late it runs", () => {
    expect(describeRun(run({ repeatCount: 11, lastTime: "23:00" }))).toBe("11 times, until 23:00");
  });

  // Both facts can be true at once - eleven held slots need to say both - so they are joined
  // rather than one silently winning.
  it("says both the repeat and the reason when a collapsed run is also held", () => {
    expect(
      describeRun(run({ repeatCount: 4, lastTime: "23:00", state: "held", deliveredAt: "08:00" })),
    ).toBe("4 times, until 23:00 · Quiet hours — arrives at 08:00");
  });

  it("says nothing extra about a single ordinary run", () => {
    expect(describeRun(run())).toBeNull();
    expect(describeRun(run({ repeatCount: 1 }))).toBeNull();
  });
});

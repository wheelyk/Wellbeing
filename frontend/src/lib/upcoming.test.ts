import { describe, it, expect } from "vitest";
import { describeState, groupRunsByDay, stateLabel, type UpcomingRun } from "./upcoming";

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

describe("describeState", () => {
  // Held is not lost. Saying when it will actually arrive is the entire point of the state - "held"
  // on its own would read as "you won't get this".
  it("says when a held reminder will actually arrive", () => {
    expect(describeState(run({ state: "held", deliveredAt: "08:00" }))).toBe(
      "Quiet hours — arrives at 08:00",
    );
  });

  it("still explains a held reminder with no delivery time", () => {
    expect(describeState(run({ state: "held" }))).toBe("Quiet hours");
  });

  it("explains why a run will not fire", () => {
    expect(describeState(run({ state: "logged" }))).toMatch(/won't fire/);
    expect(describeState(run({ state: "paused" }))).toMatch(/switched off/);
  });

  // An ordinary due reminder needs no explanation, and a line saying "scheduled" under every row
  // would be noise on the common case.
  it("says nothing about an ordinary scheduled run", () => {
    expect(describeState(run())).toBeNull();
    expect(stateLabel("scheduled")).toBeNull();
  });
});

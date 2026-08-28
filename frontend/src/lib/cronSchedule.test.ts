import { describe, it, expect } from "vitest";
import {
  buildSchedules,
  parseSchedules,
  describeSchedules,
  presetForDays,
  daysForPreset,
  type ScheduleDraft,
} from "./cronSchedule";

const draft = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  mode: "times",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  times: ["09:00"],
  expressions: [],
  ...over,
});

describe("buildSchedules", () => {
  it("writes a daily time as an every-day expression", () => {
    expect(buildSchedules(draft())).toEqual(["0 9 * * *"]);
  });

  it("writes one expression per time", () => {
    expect(buildSchedules(draft({ times: ["08:00", "20:30"] }))).toEqual([
      "0 8 * * *",
      "30 20 * * *",
    ]);
  });

  it("uses readable day fields for the common presets", () => {
    expect(buildSchedules(draft({ daysOfWeek: [1, 2, 3, 4, 5] }))).toEqual(["0 9 * * 1-5"]);
    expect(buildSchedules(draft({ daysOfWeek: [0, 6] }))).toEqual(["0 9 * * 0,6"]);
    expect(buildSchedules(draft({ daysOfWeek: [1, 3, 5], times: ["18:30"] }))).toEqual([
      "30 18 * * 1,3,5",
    ]);
  });

  it("writes hourly as a wildcard hour", () => {
    expect(buildSchedules(draft({ mode: "hourly" }))).toEqual(["0 * * * *"]);
    expect(buildSchedules(draft({ mode: "hourly", daysOfWeek: [1, 2, 3, 4, 5] }))).toEqual([
      "0 * * * 1-5",
    ]);
  });

  it("passes a hand-written expression straight through", () => {
    expect(buildSchedules(draft({ mode: "expression", expressions: ["0 7 1,15 * *"] }))).toEqual([
      "0 7 1,15 * *",
    ]);
  });
});

describe("parseSchedules", () => {
  it("reads a daily time back into times mode", () => {
    expect(parseSchedules(["0 9 * * *"])).toMatchObject({
      mode: "times",
      times: ["09:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("reads day ranges and lists back into day numbers", () => {
    expect(parseSchedules(["0 8 * * 1-5"]).daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(parseSchedules(["30 10 * * 0,6"]).daysOfWeek).toEqual([0, 6]);
    expect(parseSchedules(["30 18 * * 1,3,5"]).daysOfWeek).toEqual([1, 3, 5]);
  });

  it("reads an hourly expression back into hourly mode", () => {
    expect(parseSchedules(["0 * * * *"])).toMatchObject({ mode: "hourly" });
    expect(parseSchedules(["0 * * * 1-5"])).toMatchObject({
      mode: "hourly",
      daysOfWeek: [1, 2, 3, 4, 5],
    });
  });

  it("zero-pads times so they render consistently", () => {
    expect(parseSchedules(["5 7 * * *"]).times).toEqual(["07:05"]);
  });

  // The escape hatch. Each of these is valid cron the controls simply can't show, so the raw text
  // must survive untouched rather than being rounded to something nearby.
  it.each([
    ["a day-of-month rule", "0 7 1,15 * *"],
    ["a month restriction", "0 9 * 12 *"],
    ["a step in the minute field", "*/15 * * * *"],
    ["a step in the hour field", "0 */3 * * *"],
    ["an hourly rule that isn't on the hour", "30 * * * *"],
  ])("falls back to expression mode for %s", (_label, expression) => {
    const parsed = parseSchedules([expression]);
    expect(parsed.mode).toBe("expression");
    expect(parsed.expressions).toEqual([expression]);
  });

  it("falls back to expression mode when two entries disagree about which days they run", () => {
    // A single row of day toggles couldn't represent this without misstating one of them.
    const parsed = parseSchedules(["0 8 * * 1-5", "0 10 * * 0,6"]);
    expect(parsed.mode).toBe("expression");
  });

  it("round-trips everything the picker can generate", () => {
    for (const original of [
      draft(),
      draft({ times: ["08:00", "20:30"] }),
      draft({ daysOfWeek: [1, 2, 3, 4, 5] }),
      draft({ daysOfWeek: [0, 6], times: ["10:30"] }),
      draft({ daysOfWeek: [1, 3, 5], times: ["18:30"] }),
      draft({ mode: "hourly" }),
      draft({ mode: "hourly", daysOfWeek: [1, 2, 3, 4, 5] }),
    ]) {
      const parsed = parseSchedules(buildSchedules(original));
      expect(parsed.mode).toBe(original.mode);
      expect(parsed.daysOfWeek).toEqual(original.daysOfWeek);
      if (original.mode === "times") expect(parsed.times).toEqual(original.times);
    }
  });
});

describe("describeSchedules", () => {
  it("describes times and days in plain English", () => {
    expect(describeSchedules(["0 9 * * *"])).toBe("09:00 daily");
    expect(describeSchedules(["0 8 * * *", "0 20 * * *"])).toBe("08:00, 20:00 daily");
    expect(describeSchedules(["0 8 * * 1-5"])).toBe("08:00 weekdays");
    expect(describeSchedules(["30 10 * * 0,6"])).toBe("10:30 weekends");
    expect(describeSchedules(["0 9 * * 1,4"])).toBe("09:00 Mon, Thu");
  });

  it("describes hourly schedules", () => {
    expect(describeSchedules(["0 * * * *"])).toBe("Every hour, daily");
    expect(describeSchedules(["0 * * * 1-5"])).toBe("Every hour, weekdays");
  });

  it("says plainly when a schedule is beyond the simple controls", () => {
    expect(describeSchedules(["0 7 1,15 * *"])).toBe("Custom schedule");
    expect(describeSchedules(["0 7 1 * *", "*/15 9 * * *"])).toBe("2 custom schedules");
  });
});

describe("presets", () => {
  it("recognises which preset a day selection corresponds to", () => {
    expect(presetForDays([0, 1, 2, 3, 4, 5, 6])).toBe("daily");
    expect(presetForDays([1, 2, 3, 4, 5])).toBe("weekdays");
    expect(presetForDays([0, 6])).toBe("weekends");
    expect(presetForDays([1, 3, 5])).toBe("custom");
  });

  it("keeps the current selection when switching to custom, rather than clearing it", () => {
    expect(daysForPreset("custom", [1, 3, 5])).toEqual([1, 3, 5]);
    // Never returns an empty selection - a schedule with no days would simply never fire.
    expect(daysForPreset("custom", [])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

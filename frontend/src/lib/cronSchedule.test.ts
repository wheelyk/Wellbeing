import { describe, it, expect } from "vitest";
import {
  buildSchedules,
  parseSchedules,
  describeSchedules,
  describeRule,
  presetForDays,
  daysForPreset,
  emptyRule,
  type ScheduleDraft,
  type ScheduleRule,
} from "./cronSchedule";

const rule = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  times: ["09:00"],
  ...over,
});

const draft = (rules: ScheduleRule[]): ScheduleDraft => ({
  mode: "rules",
  rules,
  expressions: [],
});

describe("buildSchedules", () => {
  it("writes a daily time as an every-day expression", () => {
    expect(buildSchedules(draft([rule()]))).toEqual(["0 9 * * *"]);
  });

  it("writes one expression per time within a rule", () => {
    expect(buildSchedules(draft([rule({ times: ["08:00", "20:30"] })]))).toEqual([
      "0 8 * * *",
      "30 20 * * *",
    ]);
  });

  it("uses readable day fields for the common presets", () => {
    expect(buildSchedules(draft([rule({ daysOfWeek: [1, 2, 3, 4, 5] })]))).toEqual(["0 9 * * 1-5"]);
    expect(buildSchedules(draft([rule({ daysOfWeek: [0, 6] })]))).toEqual(["0 9 * * 0,6"]);
    expect(buildSchedules(draft([rule({ daysOfWeek: [1, 3, 5], times: ["18:30"] })]))).toEqual([
      "30 18 * * 1,3,5",
    ]);
  });

  // The whole point of this change: two rules a single set of day toggles could never express
  // together.
  it("concatenates the expressions of several rules", () => {
    expect(
      buildSchedules(
        draft([
          rule({ daysOfWeek: [1, 2, 3, 4, 5], times: ["08:00"] }),
          rule({ daysOfWeek: [0, 6], times: ["10:00"] }),
        ]),
      ),
    ).toEqual(["0 8 * * 1-5", "0 10 * * 0,6"]);
  });

  it("dedupes an expression two overlapping rules both produce", () => {
    expect(
      buildSchedules(draft([rule({ times: ["09:00"] }), rule({ times: ["09:00", "21:00"] })])),
    ).toEqual(["0 9 * * *", "0 21 * * *"]);
  });

  it("passes a hand-written expression straight through", () => {
    expect(
      buildSchedules({ mode: "expression", rules: [], expressions: ["0 7 1,15 * *"] }),
    ).toEqual(["0 7 1,15 * *"]);
  });
});

describe("parseSchedules", () => {
  it("reads a daily time back into a single rule", () => {
    const parsed = parseSchedules(["0 9 * * *"]);
    expect(parsed.mode).toBe("rules");
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]).toMatchObject({
      times: ["09:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("groups several times on the same days into one rule", () => {
    const parsed = parseSchedules(["0 8 * * 1-5", "30 20 * * 1-5"]);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0].times).toEqual(["08:00", "20:30"]);
    expect(parsed.rules[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  // Previously this fell back to raw text, because one row of day toggles couldn't show both.
  it("splits expressions with different day sets into separate rules", () => {
    const parsed = parseSchedules(["0 8 * * 1-5", "0 10 * * 0,6"]);
    expect(parsed.mode).toBe("rules");
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0]).toMatchObject({ times: ["08:00"], daysOfWeek: [1, 2, 3, 4, 5] });
    expect(parsed.rules[1]).toMatchObject({ times: ["10:00"], daysOfWeek: [0, 6] });
  });

  it("keeps rules in the order their expressions first appear", () => {
    const parsed = parseSchedules(["0 10 * * 0,6", "0 8 * * 1-5"]);
    expect(parsed.rules.map((r) => r.daysOfWeek)).toEqual([
      [0, 6],
      [1, 2, 3, 4, 5],
    ]);
  });

  // Hourly is no longer something the controls can edit, so it comes back as raw text for editing
  // - while still being described readably in a row (see the describeSchedules tests below).
  it("treats an hourly expression as raw text, since the controls no longer offer it", () => {
    expect(parseSchedules(["0 * * * *"]).mode).toBe("expression");
    expect(parseSchedules(["0 * * * 1-5"]).mode).toBe("expression");
  });

  it("zero-pads times so they render consistently", () => {
    expect(parseSchedules(["5 7 * * *"]).rules[0].times).toEqual(["07:05"]);
  });

  // The escape hatch. Each of these is valid cron the controls simply can't show, so the raw text
  // must survive untouched rather than being rounded to something nearby.
  it.each([
    ["a day-of-month rule", "0 7 1,15 * *"],
    ["a month restriction", "0 9 * 12 *"],
    ["a step in the minute field", "*/15 * * * *"],
    ["a step in the hour field", "0 */3 * * *"],
    ["an hourly rule", "0 * * * *"],
    ["an hourly rule that isn't on the hour", "30 * * * *"],
  ])("falls back to expression mode for %s", (_label, expression) => {
    const parsed = parseSchedules([expression]);
    expect(parsed.mode).toBe("expression");
    expect(parsed.expressions).toEqual([expression]);
  });

  it("falls back to expression mode if any one entry is unrepresentable", () => {
    expect(parseSchedules(["0 8 * * 1-5", "0 7 1,15 * *"]).mode).toBe("expression");
  });

  it("round-trips everything the picker can generate", () => {
    for (const original of [
      draft([rule()]),
      draft([rule({ times: ["08:00", "20:30"] })]),
      draft([rule({ daysOfWeek: [1, 2, 3, 4, 5] })]),
      draft([rule({ daysOfWeek: [1, 3, 5], times: ["18:30"] })]),
      draft([
        rule({ daysOfWeek: [1, 2, 3, 4, 5], times: ["08:00"] }),
        rule({ daysOfWeek: [0, 6], times: ["10:00"] }),
      ]),
    ]) {
      const parsed = parseSchedules(buildSchedules(original));
      expect(parsed.mode).toBe("rules");
      expect(parsed.rules).toHaveLength(original.rules.length);
      original.rules.forEach((expected, i) => {
        expect(parsed.rules[i].daysOfWeek).toEqual(expected.daysOfWeek);
        expect(parsed.rules[i].times).toEqual(expected.times);
      });
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

  // Display survives even though editing does not: a schedule already saved as hourly still reads
  // as what it is, rather than degrading to an anonymous "custom schedule".
  it("describes hourly schedules", () => {
    expect(describeSchedules(["0 * * * *"])).toBe("Every hour, daily");
    expect(describeSchedules(["0 * * * 1-5"])).toBe("Every hour, weekdays");
  });

  it("joins several rules so a row still reads at a glance", () => {
    expect(describeSchedules(["0 8 * * 1-5", "0 10 * * 0,6"])).toBe(
      "08:00 weekdays · 10:00 weekends",
    );
  });

  // A temporary reminder is typically an interval, so this is the shape most of them render as.
  // Before these were described, the headline case of the whole feature read as "Custom schedule".
  it("reads an interval out in plain words, even though the controls can't draw one", () => {
    expect(describeSchedules(["0 */2 * * *"])).toBe("Every 2 hours, daily");
    expect(describeSchedules(["*/30 * * * *"])).toBe("Every 30 minutes, daily");
    expect(describeSchedules(["15 */4 * * *"])).toBe("Every 4 hours at 15 past, daily");
    // Already readable through the hourly rule the controls still offer - asserted here so the
    // two routes to the same sentence stay in step.
    expect(describeSchedules(["0 * * * *"])).toBe("Every hour, daily");
    expect(describeSchedules(["0 */2 * * 1-5"])).toBe("Every 2 hours, weekdays");
  });

  // Describing one must not imply the controls can edit it - that would put day toggles on screen
  // claiming to represent a step they cannot express.
  it("still refuses to parse an interval back into controls", () => {
    expect(parseSchedules(["0 */2 * * *"]).mode).toBe("expression");
    expect(parseSchedules(["*/30 * * * *"]).mode).toBe("expression");
  });

  it("says plainly when a schedule is beyond the simple controls", () => {
    expect(describeSchedules(["0 7 1,15 * *"])).toBe("Custom schedule");
    // A day-of-month restriction is not an interval, so it stays "custom" - the new helper must
    // not claim more than it can actually read.
    expect(describeSchedules(["0 */2 1,15 * *"])).toBe("Custom schedule");
    expect(describeSchedules(["0 7 1 * *", "*/15 9 * * *"])).toBe("2 custom schedules");
  });

  it("describes a single rule on its own", () => {
    expect(describeRule({ daysOfWeek: [1, 2, 3, 4, 5], times: ["08:00"] })).toBe("08:00 weekdays");
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
    // Never returns an empty selection - a rule with no days would simply never fire.
    expect(daysForPreset("custom", [])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("starts a new rule on a sensible default rather than an empty one", () => {
    expect(emptyRule()).toMatchObject({ times: ["09:00"] });
    expect(buildSchedules(draft([emptyRule()]))).toEqual(["0 9 * * *"]);
  });
});

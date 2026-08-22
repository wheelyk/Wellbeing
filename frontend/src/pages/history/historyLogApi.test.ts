import { describe, it, expect } from "vitest";
import {
  moodLabel,
  symptomLabel,
  medicationLabel,
  habitValueLabel,
  habitLabel,
} from "./historyLogApi";

// This file's label-formatting functions mirror backend/src/routes/history.ts's own copies of
// the same logic exactly (see historyLogApi.ts's own top-of-file comment on why) - previously
// untested here, the same real gap the backend's own dashboard.ts/history.ts tests just closed:
// only boolean-type habit values had ever been exercised by any test, anywhere in the codebase,
// across all three independent copies of this formatting logic (two backend, one frontend).
describe("historyLogApi label formatting", () => {
  describe("moodLabel", () => {
    it("shows just the mood when energy/stress are null", () => {
      expect(moodLabel({ mood: 4, energy: null, stress: null })).toBe("Mood 4/5");
    });

    it("appends energy and/or stress when present", () => {
      expect(moodLabel({ mood: 3, energy: 5, stress: null })).toBe("Mood 3/5 · Energy 5/7");
      expect(moodLabel({ mood: 3, energy: null, stress: 2 })).toBe("Mood 3/5 · Stress 2/7");
      expect(moodLabel({ mood: 3, energy: 5, stress: 2 })).toBe(
        "Mood 3/5 · Energy 5/7 · Stress 2/7",
      );
    });
  });

  it("symptomLabel combines the symptom name and severity", () => {
    expect(symptomLabel("Headache", 6)).toBe("Headache — Severity 6/10");
  });

  describe("medicationLabel", () => {
    it("includes dosage when present, omits it when null", () => {
      expect(medicationLabel("Ibuprofen", "200mg", true)).toBe("Ibuprofen — 200mg — Taken");
      expect(medicationLabel("Ibuprofen", null, false)).toBe("Ibuprofen — Not taken");
    });
  });

  describe("habitValueLabel", () => {
    it("formats a boolean value as Done/Not done", () => {
      expect(
        habitValueLabel({ valueBoolean: true, valueNumeric: null, valueDurationMinutes: null }),
      ).toBe("Done");
      expect(
        habitValueLabel({ valueBoolean: false, valueNumeric: null, valueDurationMinutes: null }),
      ).toBe("Not done");
    });

    // Regression test: only the boolean branch had ever been exercised anywhere this exact
    // logic is duplicated (backend dashboard.ts, backend history.ts, and this file) - numeric
    // and duration values were unverified, including the not-quite-obvious case of a real,
    // valid `0` value, which a naive truthiness check (instead of `!== null`) would render as
    // the wrong branch entirely.
    it("formats a numeric value as its plain number, including zero", () => {
      expect(
        habitValueLabel({ valueBoolean: null, valueNumeric: 6, valueDurationMinutes: null }),
      ).toBe("6");
      expect(
        habitValueLabel({ valueBoolean: null, valueNumeric: 0, valueDurationMinutes: null }),
      ).toBe("0");
    });

    it("formats a duration value in minutes, including zero", () => {
      expect(
        habitValueLabel({ valueBoolean: null, valueNumeric: null, valueDurationMinutes: 15 }),
      ).toBe("15 min");
      expect(
        habitValueLabel({ valueBoolean: null, valueNumeric: null, valueDurationMinutes: 0 }),
      ).toBe("0 min");
    });
  });

  it("habitLabel combines the habit name and its formatted value", () => {
    expect(
      habitLabel("Meditation", {
        valueBoolean: null,
        valueNumeric: null,
        valueDurationMinutes: 15,
      }),
    ).toBe("Meditation: 15 min");
  });
});

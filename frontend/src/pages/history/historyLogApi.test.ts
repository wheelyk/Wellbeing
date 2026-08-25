import { describe, it, expect } from "vitest";
import { moodLabel, medicationLabel, categoryValueLabel, categoryLabel } from "./historyLogApi";

// This file's label-formatting functions mirror backend/src/routes/history.ts's own copies of
// the same logic exactly (see historyLogApi.ts's own top-of-file comment on why) - previously
// untested here, the same real gap the backend's own dashboard.ts/history.ts tests just closed:
// only boolean-type category values had ever been exercised by any test, anywhere in the
// codebase, across all three independent copies of this formatting logic (two backend, one
// frontend). These used to test the near-identical habitValueLabel/habitLabel (Habit) and
// symptomLabel (Symptom), which covered the same shapes before both unified into Category (Phase
// 17) - see docs/log/17-unify-mood-symptom-habit.md.
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

  describe("medicationLabel", () => {
    it("includes dosage when present, omits it when null", () => {
      expect(medicationLabel("Ibuprofen", "200mg", true)).toBe("Ibuprofen — 200mg — Taken");
      expect(medicationLabel("Ibuprofen", null, false)).toBe("Ibuprofen — Not taken");
    });
  });

  describe("categoryValueLabel", () => {
    const numericCategory = { valueType: "numeric" as const, scaleMax: null };
    const durationCategory = { valueType: "duration" as const, scaleMax: null };

    it("formats a boolean value as Done/Not done", () => {
      expect(
        categoryValueLabel(
          { valueBoolean: true, valueNumeric: null, valueDurationMinutes: null },
          numericCategory,
        ),
      ).toBe("Done");
      expect(
        categoryValueLabel(
          { valueBoolean: false, valueNumeric: null, valueDurationMinutes: null },
          numericCategory,
        ),
      ).toBe("Not done");
    });

    // Regression test: only the boolean branch had ever been exercised anywhere this exact
    // logic is duplicated (backend dashboard.ts, backend history.ts, and this file) - numeric
    // and duration values were unverified, including the not-quite-obvious case of a real,
    // valid `0` value, which a naive truthiness check (instead of `!== null`) would render as
    // the wrong branch entirely.
    it("formats a numeric value as its plain number, including zero", () => {
      expect(
        categoryValueLabel(
          { valueBoolean: null, valueNumeric: 6, valueDurationMinutes: null },
          numericCategory,
        ),
      ).toBe("6");
      expect(
        categoryValueLabel(
          { valueBoolean: null, valueNumeric: 0, valueDurationMinutes: null },
          numericCategory,
        ),
      ).toBe("0");
    });

    it("formats a duration value in minutes, including zero", () => {
      expect(
        categoryValueLabel(
          { valueBoolean: null, valueNumeric: null, valueDurationMinutes: 15 },
          durationCategory,
        ),
      ).toBe("15 min");
      expect(
        categoryValueLabel(
          { valueBoolean: null, valueNumeric: null, valueDurationMinutes: 0 },
          durationCategory,
        ),
      ).toBe("0 min");
    });

    it("formats a scale numeric value as value/max", () => {
      expect(
        categoryValueLabel(
          { valueBoolean: null, valueNumeric: 4, valueDurationMinutes: null },
          { valueType: "scale", scaleMax: 5 },
        ),
      ).toBe("4/5");
    });
  });

  it("categoryLabel combines the category name and its formatted value", () => {
    expect(
      categoryLabel(
        "Meditation",
        { valueBoolean: null, valueNumeric: null, valueDurationMinutes: 15 },
        { valueType: "duration", scaleMax: null },
      ),
    ).toBe("Meditation: 15 min");
  });
});

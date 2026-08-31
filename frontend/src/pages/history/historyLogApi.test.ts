import { describe, it, expect } from "vitest";
import { categoryValueLabel } from "./historyLogApi";

// This file's value-formatting function mirrors backend/src/routes/history.ts's own
// formatCategoryLogValue exactly (see historyLogApi.ts's own top-of-file comment on why) -
// previously untested here, the same real gap the backend's own dashboard.ts/history.ts tests
// just closed: only boolean-type category values had ever been exercised by any test, anywhere
// in the codebase, across both independent copies of this formatting logic (one backend, one
// frontend). These used to test the near-identical habitValueLabel (Habit) and symptomLabel
// (Symptom), which covered the same shapes before both unified into Category (Phase 17) - see
// docs/log/17-unify-mood-symptom-habit.md. moodLabel and medicationLabel (and Mood/Medication
// themselves) were retired the same way (Phase 17 and Phase 19 respectively, see
// docs/log/19-medication-to-category.md) - a former mood check-in's or medication dose's value
// now goes through categoryValueLabel below like any other category.
describe("historyLogApi label formatting", () => {
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
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReminderScheduleForm } from "./ReminderScheduleForm";

function renderForm(initialSchedules: string[] = [], onSave = vi.fn()) {
  render(
    <ReminderScheduleForm
      initialSchedules={initialSchedules}
      saving={false}
      error={null}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  return onSave;
}

// What this form hands back is cron, so every assertion here is on the expressions it produces -
// the controls are only interesting insofar as they generate the right ones.
describe("ReminderScheduleForm", () => {
  it("saves a daily time by default", async () => {
    const onSave = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(onSave).toHaveBeenCalledWith(["0 9 * * *"]);
  });

  it("turns a preset chip into the matching day field", async () => {
    const onSave = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Weekdays" }));
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(onSave).toHaveBeenCalledWith(["0 9 * * 1-5"]);
  });

  // Regression tests for a bug reported from a real Android phone: "the add time button isn't
  // working". Every one of these previously ended in the button doing nothing visible.
  describe("adding a time", () => {
    it("adds the chosen time to the list", async () => {
      const onSave = renderForm();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/add a time to schedule 1/i), "20:30");
      await user.click(screen.getByRole("button", { name: "+ Add time" }));
      await user.click(screen.getByRole("button", { name: "Save reminder" }));

      expect(onSave).toHaveBeenCalledWith(["0 9 * * *", "30 20 * * *"]);
    });

    it("is never disabled, so a tap always produces a visible response", () => {
      renderForm();

      // The original bug: disabled until React state held a time, which on a dark theme is
      // indistinguishable from a button that simply doesn't work.
      expect(screen.getByRole("button", { name: "+ Add time" })).toBeEnabled();
    });

    it("says why nothing was added when no time has been chosen", async () => {
      renderForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "+ Add time" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose a time first.");
    });

    it("says why nothing was added when the time is already on the schedule", async () => {
      renderForm(["0 9 * * *"]);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/add a time to schedule 1/i), "09:00");
      await user.click(screen.getByRole("button", { name: "+ Add time" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "09:00 is already on this schedule.",
      );
    });

    it("clears the error once a different time is chosen", async () => {
      renderForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "+ Add time" }));
      expect(await screen.findByRole("alert")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/add a time to schedule 1/i), "20:30");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("empties the input after adding, so the same time isn't added twice", async () => {
      renderForm();
      const user = userEvent.setup();

      const input = screen.getByLabelText(/add a time to schedule 1/i);
      await user.type(input, "20:30");
      await user.click(screen.getByRole("button", { name: "+ Add time" }));

      expect(input).toHaveValue("");
    });
  });

  it("saves an hourly schedule with no time list at all", async () => {
    const onSave = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Every hour" }));
    // Times are meaningless for an hourly rule, so the control disappears entirely.
    expect(screen.queryByLabelText(/add a time to schedule 1/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(onSave).toHaveBeenCalledWith(["0 * * * *"]);
  });

  // The point of this component's second version: a reminder that does different things on
  // different days, which one set of day toggles could never express.
  it("adds a second schedule with its own days and times", async () => {
    const onSave = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Weekdays" }));
    await user.click(screen.getByRole("button", { name: "+ Add another schedule" }));

    // The second card's controls are addressed independently of the first.
    const repeatGroups = screen.getAllByRole("group", { name: /^Repeat / });
    expect(repeatGroups).toHaveLength(2);
    await user.click(within(repeatGroups[1]).getByRole("button", { name: "Weekends" }));

    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(onSave).toHaveBeenCalledWith(["0 9 * * 1-5", "0 9 * * 0,6"]);
  });

  it("reads a two-rule schedule back into two sets of controls", async () => {
    renderForm(["0 8 * * 1-5", "0 10 * * 0,6"]);

    expect(screen.getAllByRole("group", { name: /^Repeat / })).toHaveLength(2);
    // Each card shows the preset its own expression implies, rather than both defaulting.
    const groups = screen.getAllByRole("group", { name: /^Repeat / });
    expect(within(groups[0]).getByRole("button", { name: "Weekdays" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(groups[1]).getByRole("button", { name: "Weekends" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("removes a schedule, and offers no remove control when only one is left", async () => {
    const onSave = renderForm(["0 8 * * 1-5", "0 10 * * 0,6"]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remove schedule 2" }));

    expect(screen.getAllByRole("group", { name: /^Repeat / })).toHaveLength(1);
    // A reminder needs at least one schedule, so the last one can't be removed.
    expect(screen.queryByRole("button", { name: /^Remove schedule/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save reminder" }));
    expect(onSave).toHaveBeenCalledWith(["0 8 * * 1-5"]);
  });

  it("keeps a hand-written expression exactly as written rather than redrawing it", async () => {
    const onSave = renderForm(["0 7 1,15 * *"]);
    const user = userEvent.setup();

    // No day/time controls at all - the controls can't represent this, so they aren't shown
    // pretending to.
    expect(screen.queryByRole("group", { name: /^Repeat / })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cron expressions")).toHaveValue("0 7 1,15 * *");

    await user.click(screen.getByRole("button", { name: "Save reminder" }));
    expect(onSave).toHaveBeenCalledWith(["0 7 1,15 * *"]);
  });

  it("re-derives the controls when a representable expression is typed into the cron box", async () => {
    renderForm(["0 7 1,15 * *"]);
    const user = userEvent.setup();

    const box = screen.getByLabelText("Cron expressions");
    await user.clear(box);
    await user.type(box, "0 8 * * 1-5");

    expect(
      within(screen.getByRole("group", { name: "Repeat 1" })).getByRole("button", {
        name: "Weekdays",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

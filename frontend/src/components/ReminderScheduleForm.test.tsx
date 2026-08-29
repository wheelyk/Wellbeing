import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  // The time control is a single "+" chip that opens the platform's own picker; that picker's Set
  // button is the confirmation, so `change` on the hidden input is exactly what a real selection
  // looks like from the component's point of view.
  describe("adding a time", () => {
    // Deliberately not queried by role or label: the input is aria-hidden, because the "+" button
    // is the control and the input is only the mechanism that opens the platform picker.
    const timePickerInput = () =>
      document.getElementById("reminder-add-time-0") as HTMLInputElement;

    it("opens the native picker when the + chip is tapped", async () => {
      const showPicker = vi.fn();
      // jsdom has no showPicker, so it's stubbed rather than spied - its absence is also what the
      // component's own fallback path exists for.
      (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = showPicker;
      renderForm();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /add a time to schedule 1/i }));

      expect(showPicker).toHaveBeenCalled();
      delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;
    });

    it("adds the time as soon as the picker returns one, with nothing further to press", async () => {
      const onSave = renderForm();
      const user = userEvent.setup();

      fireEvent.change(timePickerInput(), {
        target: { value: "20:30" },
      });
      await user.click(screen.getByRole("button", { name: "Save reminder" }));

      expect(onSave).toHaveBeenCalledWith(["0 9 * * *", "30 20 * * *"]);
    });

    it("shows the new time as a chip alongside the existing ones", () => {
      renderForm();

      fireEvent.change(timePickerInput(), {
        target: { value: "20:30" },
      });

      expect(screen.getByText("09:00")).toBeInTheDocument();
      expect(screen.getByText("20:30")).toBeInTheDocument();
    });

    it("says so rather than silently ignoring a time already on the schedule", () => {
      renderForm(["0 9 * * *"]);

      fireEvent.change(timePickerInput(), {
        target: { value: "09:00" },
      });

      expect(screen.getByRole("alert")).toHaveTextContent("09:00 is already on this schedule.");
    });

    it("clears the hidden input after adding, so the same time can be picked again later", () => {
      renderForm();
      const input = timePickerInput();

      fireEvent.change(input, { target: { value: "20:30" } });

      // The element keeps its own value independently of React state; if it were left set, the
      // picker would not reopen on that time.
      expect(input).toHaveValue("");
    });

    it("clears a duplicate warning once a different time is picked", () => {
      renderForm(["0 9 * * *"]);
      const input = timePickerInput();

      fireEvent.change(input, { target: { value: "09:00" } });
      expect(screen.getByRole("alert")).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "20:30" } });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

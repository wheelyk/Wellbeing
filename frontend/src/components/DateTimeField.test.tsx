import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimeField } from "./DateTimeField";

describe("DateTimeField", () => {
  it("renders a labeled datetime-local input with the given value", () => {
    render(<DateTimeField id="test-logged-at" value="2026-08-20T09:00" onChange={vi.fn()} />);

    const input = screen.getByLabelText("Date & time");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveValue("2026-08-20T09:00");
  });

  it("supports a custom label", () => {
    render(
      <DateTimeField
        id="test-logged-at"
        value="2026-08-20T09:00"
        onChange={vi.fn()}
        label="When did this happen?"
      />,
    );

    expect(screen.getByLabelText("When did this happen?")).toBeInTheDocument();
  });

  it("calls onChange with the new value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DateTimeField id="test-logged-at" value="2026-08-20T09:00" onChange={onChange} />);

    await user.type(screen.getByLabelText("Date & time"), "2026-08-21T10:30");

    expect(onChange).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingScale } from "./RatingScale";

describe("RatingScale", () => {
  it("renders one radio per value, with the current value checked", () => {
    render(
      <RatingScale
        label="Energy"
        values={[1, 2, 3, 4, 5, 6, 7]}
        value={4}
        onChange={vi.fn()}
        lowLabel="No energy"
        highLabel="Maximum energy"
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(7);
    expect(screen.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/1 = no energy/i)).toBeInTheDocument();
    expect(screen.getByText(/7 = maximum energy/i)).toBeInTheDocument();
  });

  it("calls onChange with the clicked value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <RatingScale
        label="Severity"
        values={[1, 2, 3, 4, 5]}
        value={null}
        onChange={onChange}
        lowLabel="Mild"
        highLabel="Severe"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "3" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clears back to null when clearable and the active value is clicked again", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <RatingScale
        label="Energy"
        values={[1, 2, 3]}
        value={2}
        onChange={onChange}
        lowLabel="Low"
        highLabel="High"
        clearable
      />,
    );

    await user.click(screen.getByRole("radio", { name: "2" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not clear when not clearable and the active value is clicked again", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <RatingScale
        label="Severity"
        values={[1, 2, 3]}
        value={2}
        onChange={onChange}
        lowLabel="Low"
        highLabel="High"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "2" }));

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("shows an error message when provided", () => {
    render(
      <RatingScale
        label="Severity"
        values={[1, 2, 3]}
        value={null}
        onChange={vi.fn()}
        lowLabel="Low"
        highLabel="High"
        error="Choose a severity."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a severity.");
  });
});

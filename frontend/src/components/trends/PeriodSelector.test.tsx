import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodSelector } from "./PeriodSelector";

describe("PeriodSelector", () => {
  it("renders all three period options", () => {
    render(<PeriodSelector value="7d" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "30 days" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "90 days" })).toBeInTheDocument();
  });

  it("marks the current value as checked and the others as unchecked", () => {
    render(<PeriodSelector value="30d" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "90 days" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the clicked period", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PeriodSelector value="7d" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "90 days" }));

    expect(onChange).toHaveBeenCalledWith("90d");
  });
});

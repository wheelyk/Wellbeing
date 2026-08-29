import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton } from "./ActionButton";

// jsdom doesn't evaluate CSS, so both the icon and the label are always in the DOM here and which
// one is *visible* can't be asserted at this level - that's checked in a real browser at two
// viewports instead. What these tests pin down is the part that must hold at every width and that
// a careless change could silently break: the accessible name.
describe("ActionButton", () => {
  it("uses the label as its accessible name when no separate name is given", () => {
    render(<ActionButton icon="🙈" label="Hide" onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("prefers an explicit name, so identical-looking buttons are still distinguishable", () => {
    render(<ActionButton icon="✏️" label="Edit" name="Edit Water intake" onClick={vi.fn()} />);

    // The visible word is "Edit"; what gets announced is the full, unambiguous name.
    expect(screen.getByRole("button", { name: "Edit Water intake" })).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("hides the icon from assistive technology, so it never becomes part of the name", () => {
    render(<ActionButton icon="🗑️" label="Delete" name="Delete Water intake" onClick={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Delete Water intake" });
    // The emoji must not leak into the announced name - an icon-only button whose name is an
    // emoji is the accessibility bug this component exists to avoid.
    expect(button.getAttribute("aria-label")).toBe("Delete Water intake");
    expect(screen.getByText("🗑️")).toHaveAttribute("aria-hidden", "true");
  });

  it("still behaves like a button", async () => {
    const onClick = vi.fn();
    render(<ActionButton icon="🔔" label="Remind" onClick={onClick} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remind" }));

    expect(onClick).toHaveBeenCalled();
  });

  it("passes other Button props through, so variants still work", () => {
    render(<ActionButton icon="🔔" label="Remind" variant="primary" disabled onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remind" })).toBeDisabled();
  });
});

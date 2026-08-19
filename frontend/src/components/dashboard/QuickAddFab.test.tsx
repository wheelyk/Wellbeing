import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddFab } from "./QuickAddFab";

describe("QuickAddFab", () => {
  beforeEach(() => {
    // jsdom has no real layout engine and doesn't implement scrollIntoView at all.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens the menu on click and closes it again on a second click", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("scrolls to the matching section and closes the menu when an item is clicked", async () => {
    const user = userEvent.setup();
    render(
      <>
        <section id="dashboard-section-medication" />
        <QuickAddFab />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /medication/i }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Elsewhere</button>
        <QuickAddFab />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddFab } from "./QuickAddFab";
import { DASHBOARD_QUICK_ADD_EVENT } from "../../lib/dashboardQuickAddEvent";

describe("QuickAddFab", () => {
  it("opens the menu on click and closes it again on a second click", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("dispatches a quick-add event for the matching type and closes the menu when an item is clicked", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /medication/i }));

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe("medication");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
  });

  it("dispatches the 'category' quick-add type when 'More…' is clicked", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /more/i }));

    expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe("category");

    window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
  });

  it("closes the menu when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows both built-in items plus More… when no props are given (every existing call site)", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    expect(screen.getByRole("menuitem", { name: /mood/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /medication/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /more/i })).toBeInTheDocument();
  });

  it("omits a disabled built-in category's item, but always keeps More…", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab moodEnabled={false} medicationEnabled />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    expect(screen.queryByRole("menuitem", { name: /mood/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /medication/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /more/i })).toBeInTheDocument();
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

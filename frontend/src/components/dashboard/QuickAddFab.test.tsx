import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddFab } from "./QuickAddFab";
import { DASHBOARD_QUICK_ADD_EVENT } from "../../lib/dashboardQuickAddEvent";
import { DASHBOARD_TASK_ACTION_EVENT } from "../../lib/dashboardTaskActionEvent";

// Used to open a small dropdown menu (Medication vs. "More…") until Medication itself unified
// into Category (Phase 19, see docs/log/19-medication-to-category.md) left only one destination,
// at which point "+" started dispatching the quick-add event directly - a menu in front of one
// choice was pure friction. The menu is back (docs/log/51-one-off-tasks.md) now that a Task is a
// second, genuinely different thing to add - not a contradiction of that earlier removal, the
// same reasoning applied to a case where it no longer holds.
describe("QuickAddFab", () => {
  it("opens a choice, not either destination directly, on the first tap", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    expect(screen.getByRole("dialog", { name: "Quick add" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log a category entry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add a task/i })).toBeInTheDocument();
  });

  it("dispatches the quick-add event when 'Log a category entry' is chosen, and closes the choice", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("button", { name: /log a category entry/i }));

    expect(handler).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
  });

  it("dispatches an add-task action when 'Add a task' is chosen, and closes the choice", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_TASK_ACTION_EVENT, handler);
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("button", { name: /add a task/i }));

    expect(handler).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    window.removeEventListener(DASHBOARD_TASK_ACTION_EVENT, handler);
  });
});

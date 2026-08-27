import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddFab } from "./QuickAddFab";
import { DASHBOARD_QUICK_ADD_EVENT } from "../../lib/dashboardQuickAddEvent";

// Used to open a small dropdown menu (Medication vs. "More…") until Medication itself unified
// into Category (Phase 19, see docs/log/19-medication-to-category.md) - "category" became the
// only possible destination, so the intermediate menu was pure friction for a single-item choice;
// this button now dispatches the quick-add event directly.
describe("QuickAddFab", () => {
  it("dispatches the quick-add event directly when clicked", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    expect(handler).toHaveBeenCalledOnce();

    window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
  });

  it("renders no dropdown menu of its own", async () => {
    const user = userEvent.setup();
    render(<QuickAddFab />);

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

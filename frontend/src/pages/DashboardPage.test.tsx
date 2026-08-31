import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { DashboardPage } from "./DashboardPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDashboard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

// Timeline fires three simultaneous calls via Promise.all (plus its own one-off range-chip probe,
// also against /recent) - mockImplementation is required (not mockResolvedValue) to give each
// call its own fresh, independently-readable Response. DashboardSummary's GET /api/dashboard
// expects a differently-shaped object; everything else (including /api/categories, which
// CategoryLogger fetches on mount) falls through to the plain-array default, the same
// "auto-handle, override only when needed" convention CategoriesPage.test.tsx already uses.
function mockDashboardFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/dashboard")) {
      return Promise.resolve(
        jsonResponse(200, {
          date: "2026-08-17",
          loggedTodayCount: 0,
          recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
          streak: { current: 0, daysLoggedThisWeek: 0 },
        }),
      );
    }
    if (url.includes("/api/reminders/upcoming") || url.includes("/api/reminders/recent")) {
      return Promise.resolve(
        jsonResponse(200, { timezone: "UTC", today: "2026-08-17", truncated: false, runs: [] }),
      );
    }
    if (url.includes("/api/tasks")) {
      return Promise.resolve(
        jsonResponse(200, { timezone: "UTC", today: "2026-08-17", tasks: [] }),
      );
    }
    return Promise.resolve(jsonResponse(200, []));
  });
  vi.stubGlobal("fetch", fetchMock);
}

// A composition-level guard, not a re-test of each piece's own behavior (that's already covered
// by DashboardSummary.test.tsx, TimelinePanel.test.tsx, CategoryLogger.test.tsx and
// QuickAddFab.test.tsx). This exists specifically to catch a regression in how DashboardPage wires
// them together - e.g. a future edit accidentally dropping an import, or breaking NavBar - since
// nothing else in the suite renders DashboardPage as a whole.
describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav, the dashboard summary, and the timeline together", async () => {
    mockDashboardFetch();

    renderDashboard();

    // Two of each nav link now legitimately exist in the DOM at once: NavBar's own top nav
    // (hidden below `md:`, visible from `md:` up) and BottomNav's fixed tab bar (visible below
    // `md:`, hidden from `md:` up) - see NavBar.tsx/BottomNav.tsx. jsdom can't compute which one
    // is actually visible at a given width (no real layout engine, no compiled stylesheet - see
    // both components' own tests for that caveat), so this composition guard just confirms both
    // navigation surfaces rendered, rather than asserting on a single link that no longer
    // uniquely identifies either one.
    expect(screen.getAllByRole("link", { name: "Home" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log an entry for today/i })).toBeInTheDocument();
    expect(await screen.findByText("Timeline")).toBeInTheDocument();
  });

  it("opens the quick-add choice from the floating Quick Add button, and reaches category creation from it", async () => {
    mockDashboardFetch();
    const user = userEvent.setup();

    renderDashboard();
    await screen.findByRole("button", { name: /log an entry for today/i });

    // No dialog open yet - the FAB doesn't open one until clicked.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    // The FAB's own choice (docs/log/51-one-off-tasks.md) - between logging a category entry and
    // adding a task - not either destination directly.
    expect(screen.getByRole("dialog", { name: "Quick add" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log a category entry/i }));

    // CategoryLogger renders no visible trigger of its own any more - this proves the FAB's own
    // choice still reaches it via the shared dashboardQuickAddEvent, not a coincidence of some
    // other trigger.
    expect(screen.getByRole("dialog", { name: "Create your first category" })).toBeInTheDocument();
  });

  it("opens the task form from the floating Quick Add button's own choice", async () => {
    mockDashboardFetch();
    const user = userEvent.setup();

    renderDashboard();
    await screen.findByRole("button", { name: /log an entry for today/i });

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    // Scoped to the open choice dialog specifically - Timeline's own "+" (see TimelinePanel.tsx)
    // shares this exact accessible name, and an unscoped query would find both.
    const choice = screen.getByRole("dialog", { name: "Quick add" });
    await user.click(within(choice).getByRole("button", { name: /add a task/i }));

    // TaskManager renders no visible trigger of its own either - same proof as the category-entry
    // case above, for the other half of the FAB's choice.
    expect(screen.getByRole("dialog", { name: "Add a task" })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

// A composition-level guard, not a re-test of each section's own behavior (that's already
// covered by CategorySection.test.tsx). This exists specifically to catch a regression in how
// DashboardPage wires its sections together - e.g. a future edit accidentally dropping an
// import, or breaking NavBar - since nothing else in the suite renders DashboardPage as a whole.
describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav, the dashboard summary, and the category section together", async () => {
    // CategorySection fires two simultaneous calls via Promise.all, so mockImplementation is
    // required here (not mockResolvedValue) to give each call its own fresh, independently-
    // readable Response - see docs/log/08-git-github-workflow.md for why mockResolvedValue
    // silently breaks this. DashboardSummary's GET /api/dashboard expects a differently-shaped
    // object; /api/category-logs is paginated ({entries, limit, offset, hasMore} - see
    // backend/src/lib/pagination.ts) while /api/categories is still a plain array - both
    // special-cased by URL here.
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
      // The Timeline panel fetches both of these on every Dashboard render. Defaulted here so
      // the tests that are about something else do not need to know it exists - the same
      // "auto-handle, override only when needed" convention CategoriesPage.test.tsx already uses.
      if (url.includes("/api/reminders/upcoming") || url.includes("/api/reminders/recent")) {
        return Promise.resolve(
          jsonResponse(200, {
            timezone: "UTC",
            today: "2026-08-17",
            truncated: false,
            runs: [],
          }),
        );
      }
      if (url.includes("-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
        );
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal("fetch", fetchMock);

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

    expect(screen.getByRole("button", { name: "Add category entry" })).toBeInTheDocument();

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(await screen.findByText("Log a category")).toBeInTheDocument();
  });

  it("opens the category add dialog directly from the floating Quick Add button", async () => {
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
      // The Timeline panel fetches both of these on every Dashboard render. Defaulted here so
      // the tests that are about something else do not need to know it exists - the same
      // "auto-handle, override only when needed" convention CategoriesPage.test.tsx already uses.
      if (url.includes("/api/reminders/upcoming") || url.includes("/api/reminders/recent")) {
        return Promise.resolve(
          jsonResponse(200, {
            timezone: "UTC",
            today: "2026-08-17",
            truncated: false,
            runs: [],
          }),
        );
      }
      if (url.includes("-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
        );
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderDashboard();
    await screen.findByText("Log a category");

    // No dialog open yet - the FAB doesn't open one until clicked.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));

    // The category section's own "+" button never got clicked directly - this proves the FAB
    // reaches it via the shared dashboardQuickAddEvent, not a coincidence of some other trigger.
    expect(screen.getByRole("dialog", { name: "Create your first category" })).toBeInTheDocument();
  });
});

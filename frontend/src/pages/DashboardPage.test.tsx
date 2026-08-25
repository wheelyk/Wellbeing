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
// covered by CategorySection.test.tsx / MedicationSection.test.tsx / etc). This exists
// specifically to catch a regression in how DashboardPage wires its sections together - e.g. a
// future edit accidentally dropping one section's import, or breaking NavBar - since nothing
// else in the suite renders DashboardPage as a whole.
describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav, the dashboard summary, and all log-type sections together", async () => {
    // Every section fires its own fetch on mount; some (Medication, Category) fire two
    // simultaneous calls via Promise.all, so mockImplementation is required here (not
    // mockResolvedValue) to give each call its own fresh, independently-readable Response -
    // see docs/log/08-git-github-workflow.md for why mockResolvedValue silently breaks this.
    // DashboardSummary's GET /api/dashboard expects a differently-shaped object; the *-logs
    // endpoints (medication/category) are paginated ({entries, limit, offset, hasMore} - see
    // backend/src/lib/pagination.ts) while their sibling list endpoints (/api/categories,
    // /api/medications) are still plain arrays - both special-cased by URL here.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          jsonResponse(200, {
            date: "2026-08-17",
            medicationSummary: { taken: 0, total: 0 },
            recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
            streak: { current: 0, daysLoggedThisWeek: 0 },
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
    expect(screen.getByRole("button", { name: "Add medication entry" })).toBeInTheDocument();

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(await screen.findByText("Your categories")).toBeInTheDocument();
    expect(await screen.findByText("Recent medications")).toBeInTheDocument();
  });

  it("opens a section's add dialog directly from the floating Quick Add button", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          jsonResponse(200, {
            date: "2026-08-17",
            medicationSummary: { taken: 0, total: 0 },
            recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
            streak: { current: 0, daysLoggedThisWeek: 0 },
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
    await screen.findByText("Recent medications");

    // No dialog open yet - the FAB's own menu is closed by default.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    await user.click(screen.getByRole("menuitem", { name: /medication/i }));

    // Medication's own "+" button never got clicked directly - this proves the FAB reaches it
    // via the shared dashboardQuickAddEvent, not a coincidence of some other trigger.
    expect(screen.getByRole("dialog", { name: "Log a medication" })).toBeInTheDocument();
  });

  it("hides the Medication section and Quick Add entry when disabled, but leaves Categories alone", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(200, {
            user: {
              id: "user-1",
              email: "test@example.com",
              displayName: "Test User",
              timezone: "UTC",
              createdAt: "2026-01-01T00:00:00.000Z",
              isAdmin: false,
              medicationEnabled: false,
            },
            accessToken: "test-token",
          }),
        );
      }
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          jsonResponse(200, {
            date: "2026-08-17",
            medicationSummary: { taken: 0, total: 0 },
            recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
            streak: { current: 0, daysLoggedThisWeek: 0 },
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

    expect(await screen.findByText("Your categories")).toBeInTheDocument();
    expect(screen.queryByText("Recent medications")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add medication entry" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.queryByRole("menuitem", { name: /medication/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /more/i })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSummary } from "./DashboardSummary";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// This component only ever fires a single `fetch` call (one GET /api/dashboard, no
// Promise.all), so `.mockResolvedValue` returning the same Response object for every call is
// safe here - unlike CategorySection, which fires two calls and specifically needs
// `.mockImplementation` instead (see that component's tests for why).
function mockDashboardFetch(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status, body)));
}

describe("DashboardSummary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state before the fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<DashboardSummary />);
    expect(screen.getByText(/loading your summary/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    mockDashboardFetch({ error: { message: "Oops" } }, 500);
    render(<DashboardSummary />);
    expect(await screen.findByText(/couldn't load your dashboard summary/i)).toBeInTheDocument();
  });

  it("shows a friendly empty state for a first-time user with nothing logged", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 0,
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(screen.getByText(/no current logging streak/i)).toBeInTheDocument();
    // The friendly empty-state copy above should replace, not sit alongside, a "logged N" line.
    expect(screen.queryByText(/logged \d+ entr/i)).not.toBeInTheDocument();
  });

  it("renders the date heading and the day's summary line", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 2,
      streak: { current: 3, daysLoggedThisWeek: 4 },
    });

    render(<DashboardSummary />);

    // The exact date format depends on the test environment's system locale (the component
    // deliberately doesn't hard-code a locale - see formatDisplayDate's comment) - so this
    // checks for the pieces that must appear regardless of locale-specific ordering/punctuation,
    // rather than asserting one exact rendered string.
    // Level 1, not 2 - the date is the page's one true heading, since DashboardPage no longer has
    // a heading of its own (see docs/log/48-dashboard-heading-merge.md).
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/monday/i);
    expect(heading.textContent).toMatch(/august/i);
    expect(heading.textContent).toMatch(/17/);
    expect(heading.textContent).toMatch(/2026/);
    expect(screen.getByText(/logged 2 entries today/i)).toBeInTheDocument();
    expect(screen.getByText(/logging streak: 3 days/i)).toBeInTheDocument();
    expect(screen.getByText(/logged 4 of 7 days this week/i)).toBeInTheDocument();
  });

  // The identity clause that replaced DashboardPage's own separate "Welcome, {name}" heading -
  // see docs/log/48-dashboard-heading-merge.md.
  it("folds the caller's display name into the byline under the date, when given one", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 0,
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary displayName="Keith" />);

    expect(await screen.findByText(/welcome back, keith/i)).toBeInTheDocument();
  });

  // Optional, and rendered defensively: a caller with no name yet (or a test that doesn't care)
  // must not see a dangling "Welcome back, " with nothing after it.
  it("omits the welcome clause entirely when no display name is given", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 0,
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it("uses singular 'day' for a one-day streak", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 0,
      streak: { current: 1, daysLoggedThisWeek: 1 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/logging streak: 1 day(?!s)/i)).toBeInTheDocument();
  });

  it("uses singular 'entry' for a count of one", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 1,
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/logged 1 entry today/i)).toBeInTheDocument();
    expect(screen.queryByText(/logged 1 entries today/i)).not.toBeInTheDocument();
  });

  // The actual fix: previously this card only ever learned about a fresh save/delete from one
  // of the Dashboard sections by waiting out its own POLL_INTERVAL_MS (10s) poll - see
  // dashboardEntryChangedEvent.ts and this component's own POLL_INTERVAL_MS comment. This test
  // never advances real or fake time (no `vi.useFakeTimers`/`vi.advanceTimersByTime` anywhere in
  // this file), and `findByText`'s default wait is well under 10s, so the updated text only
  // appearing here can be the event listener firing, not the poll tick catching up.
  it("refetches immediately when a Dashboard section reports an entry changed, without waiting for the poll interval", async () => {
    const baseFields = {
      date: "2026-08-17",
      streak: { current: 0, daysLoggedThisWeek: 0 },
    };
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(
        jsonResponse(200, {
          ...baseFields,
          loggedTodayCount: callCount === 1 ? 0 : 1,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardSummary />);

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    dispatchDashboardEntryChanged();

    expect(await screen.findByText(/logged 1 entry today/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops listening for entry-changed events after unmount", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      loggedTodayCount: 0,
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    const { unmount } = render(<DashboardSummary />);
    await screen.findByText(/nothing logged yet today/i);
    const callsBeforeUnmount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    unmount();
    dispatchDashboardEntryChanged();
    // Nothing to await on directly (there should be no new fetch) - a microtask flush is enough
    // to prove a stray refetch didn't slip in via a listener that outlived the component.
    await Promise.resolve();

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsBeforeUnmount,
    );
  });
});

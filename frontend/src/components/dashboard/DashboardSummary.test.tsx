import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardSummary } from "./DashboardSummary";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// This component only ever fires a single `fetch` call (one GET /api/dashboard, no
// Promise.all), so `.mockResolvedValue` returning the same Response object for every call is
// safe here - unlike MedicationSection/HabitSection, which fire two calls and specifically
// need `.mockImplementation` instead (see those components' tests for why).
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
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/nothing logged yet today/i)).toBeInTheDocument();
    expect(screen.getByText(/no current logging streak/i)).toBeInTheDocument();
    expect(screen.getByText(/you haven't logged anything yet/i)).toBeInTheDocument();
    // The friendly empty-state copy above should replace, not sit alongside, the raw
    // "0 logged / 0/0 taken" summary line.
    expect(screen.queryByText(/symptoms: 0 logged/i)).not.toBeInTheDocument();
  });

  it("renders the date, the day's summary line, streak, and recent entries", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: { id: "mood-1", mood: 4 },
      symptomCount: 2,
      medicationSummary: { taken: 1, total: 2 },
      habitSummary: { loggedCount: 1, totalHabits: 3 },
      recentEntries: {
        entries: [
          {
            type: "symptom",
            label: "Headache",
            value: "6/10",
            loggedAt: "2026-08-17T14:30:00.000Z",
          },
          { type: "mood", label: "Mood", value: "4/5", loggedAt: "2026-08-17T09:00:00.000Z" },
        ],
        limit: 10,
        offset: 0,
        hasMore: false,
      },
      streak: { current: 3, daysLoggedThisWeek: 4 },
    });

    render(<DashboardSummary />);

    // The exact date format depends on the test environment's system locale (the component
    // deliberately doesn't hard-code a locale - see formatDisplayDate's comment) - so this
    // checks for the pieces that must appear regardless of locale-specific ordering/punctuation,
    // rather than asserting one exact rendered string.
    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent).toMatch(/monday/i);
    expect(heading.textContent).toMatch(/august/i);
    expect(heading.textContent).toMatch(/17/);
    expect(heading.textContent).toMatch(/2026/);
    expect(
      screen.getByText(
        /mood: 4\/5 · symptoms: 2 logged · medications: 1\/2 taken · habits: 1\/3 logged/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/logging streak: 3 days/i)).toBeInTheDocument();
    expect(screen.getByText(/logged 4 of 7 days this week/i)).toBeInTheDocument();
    expect(screen.getByText(/headache — 6\/10/i)).toBeInTheDocument();
    expect(screen.getByText(/mood — 4\/5/i)).toBeInTheDocument();
  });

  // Computed relative to the real current time (rather than mocking the clock) so these stay
  // correct no matter when the suite actually runs - the component compares calendar days using
  // `new Date()` directly (see formatEntryDateLabel's comment on why: no fake-timer setup needed
  // to keep this deterministic, just picking entry timestamps a known number of days back from
  // "now," the same reference point the component itself uses.
  function daysAgoIso(daysAgo: number): string {
    const now = new Date();
    // Midday, not midnight - keeps this away from a local-timezone day-boundary edge case no
    // matter what timezone the machine running this test happens to be in.
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12).toISOString();
  }

  it("labels a recent entry logged today as 'Today'", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: {
        entries: [{ type: "mood", label: "Mood", value: "4/5", loggedAt: daysAgoIso(0) }],
        limit: 10,
        offset: 0,
        hasMore: false,
      },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/mood — 4\/5 — today,/i)).toBeInTheDocument();
  });

  it("labels a recent entry logged yesterday as 'Yesterday', not 'Today'", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: {
        entries: [{ type: "habit", label: "Nap", value: "30 min", loggedAt: daysAgoIso(1) }],
        limit: 10,
        offset: 0,
        hasMore: false,
      },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/nap — 30 min — yesterday,/i)).toBeInTheDocument();
    expect(screen.queryByText(/nap — 30 min — today,/i)).not.toBeInTheDocument();
  });

  it("labels an older recent entry with its actual date, not a relative word", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: {
        entries: [
          { type: "medication", label: "Diazepam", value: "Taken", loggedAt: daysAgoIso(10) },
        ],
        limit: 10,
        offset: 0,
        hasMore: false,
      },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    });

    render(<DashboardSummary />);

    const entry = await screen.findByText(/diazepam — taken —/i);
    expect(entry.textContent).not.toMatch(/today|yesterday/i);
  });

  it("shows 'Not logged yet' for mood when no mood log exists for the day", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 1,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: {
        entries: [
          {
            type: "symptom",
            label: "Headache",
            value: "6/10",
            loggedAt: "2026-08-17T14:30:00.000Z",
          },
        ],
        limit: 10,
        offset: 0,
        hasMore: false,
      },
      streak: { current: 0, daysLoggedThisWeek: 1 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/mood: not logged yet/i)).toBeInTheDocument();
  });

  it("loads more recent entries by refetching with a larger limit when Load more is clicked", async () => {
    // Unlike the four per-type sections (offset-based, appending pages), this component
    // re-fetches the whole summary with a bigger `limit` on every poll tick too - see
    // DashboardSummary.tsx's own comment on why appending pages independently of polling would
    // let a background poll silently discard anything "Load more" had added.
    const entryA = {
      type: "mood",
      label: "Mood",
      value: "4/5",
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const entryB = {
      type: "habit",
      label: "Nap",
      value: "30 min",
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const baseFields = {
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("limit=20")) {
        return Promise.resolve(
          jsonResponse(200, {
            ...baseFields,
            recentEntries: { entries: [entryA, entryB], limit: 20, offset: 0, hasMore: false },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          ...baseFields,
          recentEntries: { entries: [entryA], limit: 10, offset: 0, hasMore: true },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DashboardSummary />);

    expect(await screen.findByText(/mood — 4\/5/i)).toBeInTheDocument();
    expect(screen.queryByText(/nap — 30 min/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText(/nap — 30 min/i)).toBeInTheDocument();
  });

  it("shrinks the limit and refetches when Load less is clicked after expanding", async () => {
    const entryA = {
      type: "mood",
      label: "Mood",
      value: "4/5",
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const entryB = {
      type: "habit",
      label: "Nap",
      value: "30 min",
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const baseFields = {
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      streak: { current: 0, daysLoggedThisWeek: 0 },
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("limit=20")) {
        return Promise.resolve(
          jsonResponse(200, {
            ...baseFields,
            recentEntries: { entries: [entryA, entryB], limit: 20, offset: 0, hasMore: false },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          ...baseFields,
          recentEntries: { entries: [entryA], limit: 10, offset: 0, hasMore: true },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DashboardSummary />);
    await screen.findByText(/mood — 4\/5/i);
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText(/nap — 30 min/i);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load less/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load less/i }));

    // Genuinely refetched at the smaller limit (not a local truncation, unlike the four
    // per-type sections) - Nap disappears because the mocked limit=10 response never included
    // it, not because the component hid it client-side.
    await waitFor(() => expect(screen.queryByText(/nap — 30 min/i)).not.toBeInTheDocument());
    expect(screen.getByText(/mood — 4\/5/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();
  });

  it("uses singular 'day' for a one-day streak", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: { entries: [], limit: 10, offset: 0, hasMore: false },
      streak: { current: 1, daysLoggedThisWeek: 1 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/logging streak: 1 day(?!s)/i)).toBeInTheDocument();
  });
});

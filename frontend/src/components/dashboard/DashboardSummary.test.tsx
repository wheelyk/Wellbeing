import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
      recentEntries: [],
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
      recentEntries: [
        { type: "symptom", label: "Headache", value: "6/10", loggedAt: "2026-08-17T14:30:00.000Z" },
        { type: "mood", label: "Mood", value: "4/5", loggedAt: "2026-08-17T09:00:00.000Z" },
      ],
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

  it("shows 'Not logged yet' for mood when no mood log exists for the day", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 1,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: [
        { type: "symptom", label: "Headache", value: "6/10", loggedAt: "2026-08-17T14:30:00.000Z" },
      ],
      streak: { current: 0, daysLoggedThisWeek: 1 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/mood: not logged yet/i)).toBeInTheDocument();
  });

  it("uses singular 'day' for a one-day streak", async () => {
    mockDashboardFetch({
      date: "2026-08-17",
      mood: null,
      symptomCount: 0,
      medicationSummary: { taken: 0, total: 0 },
      habitSummary: { loggedCount: 0, totalHabits: 0 },
      recentEntries: [],
      streak: { current: 1, daysLoggedThisWeek: 1 },
    });

    render(<DashboardSummary />);

    expect(await screen.findByText(/logging streak: 1 day(?!s)/i)).toBeInTheDocument();
  });
});

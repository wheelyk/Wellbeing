import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../auth/AuthContext";
import { TrendsPage } from "./TrendsPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyTrendsData(period: "7d" | "30d" | "90d" = "7d") {
  const dayCount = { "7d": 7, "30d": 30, "90d": 90 }[period];
  const days = Array.from(
    { length: dayCount },
    (_, i) => `2026-08-${String(11 + i).padStart(2, "0")}`,
  );
  return {
    period,
    startDate: days[0],
    endDate: days[days.length - 1],
    days,
    categoryTrends: [],
    activity: { days: days.map((date) => ({ date, hasActivity: false })) },
  };
}

// A SCALE categoryTrends entry standing in for what Mood now is (Phase 17 - see
// docs/log/17-unify-mood-symptom-habit.md) - there's no dedicated Mood chart section anymore,
// this route folds it into the same generic categoryTrends array every other scale category uses.
function moodTrend(days: string[], average: number | null = null) {
  return {
    categoryId: "cat-mood",
    name: "Mood",
    icon: null,
    valueType: "scale" as const,
    scaleMin: 1,
    scaleMax: 5,
    series: days.map((date) => ({ date, average: null, count: 0 })),
    average,
  };
}

// This page fires more than one `fetch` call over its lifetime (once per period change), so per
// this project's established gotcha, `.mockImplementation` (a fresh Response per call) is used
// instead of `.mockResolvedValue`, which would return the same already-consumed Response object
// on the second call.
function mockTrendsFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => Promise.resolve(jsonResponse(200, handler(url)))),
  );
}

// TrendsPage renders NavBar, which reads from AuthContext - same reason DashboardPage.test.tsx
// wraps its render in AuthProvider (+ MemoryRouter, since NavBar renders <Link>s).
function renderTrendsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/trends"]}>
        <TrendsPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("TrendsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state before the fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderTrendsPage();
    expect(screen.getByText(/loading your trends/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } })),
    );
    renderTrendsPage();
    expect(await screen.findByText(/couldn't load your trends/i)).toBeInTheDocument();
  });

  it("requests the 7-day period by default and shows empty states for a brand-new user", async () => {
    const days = emptyTrendsData("7d").days;
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, { ...emptyTrendsData("7d"), categoryTrends: [moodTrend(days)] }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderTrendsPage();

    expect(await screen.findByText(/mood — no data yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not enough data yet for this period/i)).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/trends?period=7d");
  });

  it("renders the computed averages when data is present", async () => {
    const days = emptyTrendsData("7d").days;
    mockTrendsFetch(() => ({
      ...emptyTrendsData("7d"),
      categoryTrends: [moodTrend(days, 3.4)],
    }));

    renderTrendsPage();

    expect(await screen.findByText(/mood — avg: 3\.4/i)).toBeInTheDocument();
  });

  it("refetches with the new period when a different period button is clicked", async () => {
    const user = userEvent.setup();
    mockTrendsFetch((url) => {
      const period = url.includes("period=30d") ? "30d" : "7d";
      const data = emptyTrendsData(period);
      return { ...data, categoryTrends: [moodTrend(data.days)] };
    });

    renderTrendsPage();
    await screen.findByText(/mood — no data yet/i);

    await user.click(screen.getByRole("radio", { name: "30 days" }));

    await screen.findByText(/mood — no data yet/i);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("period=30d"))).toBe(true);
  });

  it("never implies causation or diagnosis in its copy", async () => {
    mockTrendsFetch(() => emptyTrendsData("7d"));
    renderTrendsPage();

    await screen.findByText(/not a diagnosis, and not a claim about what's causing what/i);
    expect(
      screen.getByText(/not a diagnosis, and not a claim about what's causing what/i),
    ).toBeInTheDocument();
  });

  // Regression test: a migrated symptom (Phase 17 - see docs/log/17-unify-mood-symptom-habit.md)
  // no longer gets a dedicated chart section of its own - a SCALE categoryTrends entry stands in
  // here for "some second chart section alongside Mood" (itself now just another categoryTrends
  // entry, not a fixed chart of its own either), to keep exercising "collapsing one section
  // doesn't touch another" now that neither Symptom Severity nor a dedicated Mood chart exist.
  it("collapses each chart section independently via its own toggle", async () => {
    const days = emptyTrendsData("7d").days;
    mockTrendsFetch(() => ({
      ...emptyTrendsData("7d"),
      categoryTrends: [
        moodTrend(days),
        {
          categoryId: "cat-energy",
          name: "Energy level",
          icon: null,
          valueType: "scale",
          scaleMin: 1,
          scaleMax: 5,
          series: days.map((date) => ({ date, average: null, count: 0 })),
          average: null,
        },
      ],
    }));
    const user = userEvent.setup();

    renderTrendsPage();
    await screen.findByText(/mood — no data yet/i);
    // Both TrendLineChart instances (Mood and Energy level) render this same empty-state copy
    // when every point's average is null, as it is here - ActivityCalendar renders an actual
    // (mostly-inactive) grid instead, not this text, since `emptyTrendsData` gives it real day
    // entries rather than an empty array.
    expect(screen.getAllByText(/not enough data yet for this period/i)).toHaveLength(2);
    expect(screen.getByText(/days with any logged entry/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^activity$/i }));

    // Activity's own content is gone, but the two chart sections above it are untouched.
    expect(screen.queryByText(/days with any logged entry/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/not enough data yet for this period/i)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /energy level/i }));

    expect(screen.getAllByText(/not enough data yet for this period/i)).toHaveLength(1);
    // Mood's own chart is still showing - collapsing Energy level didn't touch it.
    expect(screen.getByText(/mood — no data yet/i)).toBeInTheDocument();
  });

  it("renders a chart per numeric/scale custom category, using the category's own scale bounds", async () => {
    const days = emptyTrendsData("7d").days;
    mockTrendsFetch(() => ({
      ...emptyTrendsData("7d"),
      categoryTrends: [
        {
          categoryId: "cat-energy",
          name: "Energy level",
          icon: "⚡",
          valueType: "scale",
          scaleMin: 1,
          scaleMax: 5,
          series: days.map((date, i) => ({
            date,
            average: i === days.length - 1 ? 4 : null,
            count: i === days.length - 1 ? 1 : 0,
          })),
          average: 4,
        },
        {
          categoryId: "cat-water",
          name: "Water intake",
          icon: null,
          valueType: "numeric",
          scaleMin: null,
          scaleMax: null,
          series: days.map((date) => ({ date, average: null, count: 0 })),
          average: null,
        },
      ],
    }));

    renderTrendsPage();

    expect(await screen.findByText(/⚡ energy level — avg: 4\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/logged 1–5 over/i)).toBeInTheDocument();
    expect(screen.getByText(/water intake — no data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/logged values over/i)).toBeInTheDocument();
  });

  it("renders no category chart section at all when the user has no numeric/scale categories", async () => {
    mockTrendsFetch(() => emptyTrendsData("7d"));
    renderTrendsPage();

    await screen.findByText(/not a diagnosis, and not a claim about what's causing what/i);
    expect(screen.queryByText(/avg: /i)).not.toBeInTheDocument();
  });
});

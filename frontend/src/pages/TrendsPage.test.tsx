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
    symptomSeverity: {
      series: days.map((date) => ({ date, average: null, count: 0 })),
      average: null,
    },
    mood: {
      series: days.map((date) => ({ date, average: null, count: 0 })),
      average: null,
    },
    activity: { days: days.map((date) => ({ date, hasActivity: false })) },
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
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(200, emptyTrendsData("7d"))));
    vi.stubGlobal("fetch", fetchMock);

    renderTrendsPage();

    expect(await screen.findByText(/symptom severity — no data yet/i)).toBeInTheDocument();
    expect(screen.getByText(/mood — no data yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not enough data yet for this period/i)).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/trends?period=7d");
  });

  it("renders the computed averages when data is present", async () => {
    mockTrendsFetch(() => ({
      ...emptyTrendsData("7d"),
      symptomSeverity: {
        series: emptyTrendsData("7d").symptomSeverity.series,
        average: 5.166666,
      },
      mood: { series: emptyTrendsData("7d").mood.series, average: 3.4 },
    }));

    renderTrendsPage();

    expect(await screen.findByText(/symptom severity — avg: 5\.2/i)).toBeInTheDocument();
    expect(screen.getByText(/mood — avg: 3\.4/i)).toBeInTheDocument();
  });

  it("refetches with the new period when a different period button is clicked", async () => {
    const user = userEvent.setup();
    mockTrendsFetch((url) => {
      const period = url.includes("period=30d") ? "30d" : "7d";
      return emptyTrendsData(period);
    });

    renderTrendsPage();
    await screen.findByText(/symptom severity — no data yet/i);

    await user.click(screen.getByRole("radio", { name: "30 days" }));

    await screen.findByText(/symptom severity — no data yet/i);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("period=30d"))).toBe(true);
  });

  it("never implies causation or diagnosis in its copy", async () => {
    mockTrendsFetch(() => emptyTrendsData("7d"));
    renderTrendsPage();

    await screen.findByText(/symptom severity — no data yet/i);
    expect(
      screen.getByText(/not a diagnosis, and not a claim about what's causing what/i),
    ).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendLineChart } from "./TrendLineChart";

describe("TrendLineChart", () => {
  it("shows an empty-state message when every point has no data", () => {
    render(
      <TrendLineChart
        points={[
          { date: "2026-08-15", average: null, count: 0 },
          { date: "2026-08-16", average: null, count: 0 },
        ]}
        domainMin={1}
        domainMax={10}
        color="#2563eb"
        formatValue={(v) => `${v}/10`}
        ariaLabel="Symptom severity chart"
      />,
    );

    expect(screen.getByText(/not enough data yet for this period/i)).toBeInTheDocument();
  });

  it("renders a chart group with the given aria-label when at least one day has data", () => {
    render(
      <TrendLineChart
        points={[
          { date: "2026-08-15", average: null, count: 0 },
          { date: "2026-08-16", average: 6, count: 1 },
        ]}
        domainMin={1}
        domainMax={10}
        color="#2563eb"
        formatValue={(v) => `${v}/10`}
        ariaLabel="Symptom severity chart"
      />,
    );

    expect(screen.getByRole("group", { name: "Symptom severity chart" })).toBeInTheDocument();
    expect(screen.queryByText(/not enough data yet/i)).not.toBeInTheDocument();
  });

  it("exposes each day's value through an accessible hit target, including days with no data", () => {
    render(
      <TrendLineChart
        points={[
          { date: "2026-08-15", average: null, count: 0 },
          { date: "2026-08-16", average: 6, count: 1 },
        ]}
        domainMin={1}
        domainMax={10}
        color="#2563eb"
        formatValue={(v) => `${v}/10`}
        ariaLabel="Symptom severity chart"
      />,
    );

    // The exact date format depends on the test environment's system locale (e.g. "Aug 15" vs.
    // "15 Aug") - same reasoning as DashboardSummary.test.tsx's formatDisplayDate checks - so
    // this matches either ordering rather than a fixed one.
    expect(
      screen.getByRole("button", { name: /(aug\s*15|15\s*aug):\s*no data logged/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /(aug\s*16|16\s*aug):\s*6\/10/i }),
    ).toBeInTheDocument();
  });

  it("shows a tooltip with the formatted value when a data point is focused", async () => {
    const user = userEvent.setup();
    render(
      <TrendLineChart
        points={[{ date: "2026-08-16", average: 6, count: 1 }]}
        domainMin={1}
        domainMax={10}
        color="#2563eb"
        formatValue={(v) => `${v}/10`}
        ariaLabel="Symptom severity chart"
      />,
    );

    await user.tab();

    expect(screen.getByText(/(aug\s*16|16\s*aug):\s*6\/10/i)).toBeInTheDocument();
  });
});

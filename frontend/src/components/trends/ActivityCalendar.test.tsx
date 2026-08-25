import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityCalendar } from "./ActivityCalendar";

describe("ActivityCalendar", () => {
  it("shows an empty-state message when there are no days to show", () => {
    render(<ActivityCalendar days={[]} />);

    expect(screen.getByText(/not enough data yet for this period/i)).toBeInTheDocument();
  });

  it("renders a checkmark for a logged day and the day number for an unlogged day", () => {
    render(
      <ActivityCalendar
        days={[
          { date: "2026-08-17", hasActivity: true },
          { date: "2026-08-18", hasActivity: false },
        ]}
      />,
    );

    // The exact date format depends on the test environment's system locale (e.g. "Aug 17" vs.
    // "17 Aug") - same reasoning as DashboardSummary.test.tsx's own date-format checks - so this
    // matches either ordering rather than a fixed one.
    expect(screen.getByLabelText(/(aug\s*17|17\s*aug):\s*logged/i)).toHaveTextContent("✓");
    expect(screen.getByLabelText(/nothing logged/i)).toHaveTextContent("18");
  });

  it("renders the legend explaining what a logged day means", () => {
    render(<ActivityCalendar days={[{ date: "2026-08-17", hasActivity: true }]} />);

    expect(
      screen.getByText(/day with logged activity \(mood, medications, or categories\)/i),
    ).toBeInTheDocument();
  });
});

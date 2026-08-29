import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowUpPrompt, intervalsThatFitToday } from "./FollowUpPrompt";
import { apiFetch } from "../api/client";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const apiFetchMock = vi.mocked(apiFetch);

function renderPrompt(onDismiss = vi.fn()) {
  render(<FollowUpPrompt categoryId="cat-1" categoryName="Water" onDismiss={onDismiss} />);
  return onDismiss;
}

// Every test that renders the component pins the clock to the morning, so the full set of
// intervals is always on offer regardless of when the suite happens to run. The interval-filtering
// rule itself is tested separately, against explicit times of day.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 29, 9, 0, 0));
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("intervalsThatFitToday", () => {
  // The API refuses a follow-up that would cross midnight - it would otherwise read to the
  // scheduler as a time already passed today and fire immediately. So anything that can't fit is
  // never offered, rather than offered and then rejected.
  it("offers everything early in the day", () => {
    expect(intervalsThatFitToday(new Date(2026, 7, 29, 9, 0)).map((i) => i.minutes)).toEqual([
      30, 60, 120, 240,
    ]);
  });

  it("drops the intervals that would land tomorrow", () => {
    expect(intervalsThatFitToday(new Date(2026, 7, 29, 22, 30)).map((i) => i.minutes)).toEqual([
      30, 60,
    ]);
    expect(intervalsThatFitToday(new Date(2026, 7, 29, 23, 40)).map((i) => i.minutes)).toEqual([]);
  });
});

describe("FollowUpPrompt", () => {
  it("offers the intervals that still fit today", () => {
    renderPrompt();

    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 hours" })).toBeInTheDocument();
  });

  it("renders nothing at all when the day is too far gone to fit any of them", () => {
    vi.setSystemTime(new Date(2026, 7, 29, 23, 45, 0));
    const { container } = render(
      <FollowUpPrompt categoryId="cat-1" categoryName="Water" onDismiss={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("asks the server for the follow-up and reports the time it will fire", async () => {
    apiFetchMock.mockResolvedValue({ firesAtLocal: "13:00" });
    renderPrompt();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "4 hours" }));

    // The interval is sent, not a computed time: working out "four hours from now" in the
    // account's own timezone is the server's job (see routes/reminders.ts), and the browser knows
    // only its own.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/follow-up", {
      method: "POST",
      body: JSON.stringify({ target: "category", categoryId: "cat-1", inMinutes: 240 }),
    });

    expect(await screen.findByText(/We'll remind you about Water at/)).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    // The choice has been made, so the offer is gone rather than inviting a second one.
    expect(screen.queryByRole("button", { name: "30 min" })).not.toBeInTheDocument();
  });

  it("says the entry is safe when the reminder itself fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("nope"));
    renderPrompt();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "1 hour" }));

    // The two actions are independent, and someone reading only "couldn't set that" would
    // reasonably fear they had lost the log as well.
    expect(await screen.findByRole("alert")).toHaveTextContent("Your entry was still saved.");
    // Still offered, so a transient failure can simply be retried.
    expect(screen.getByRole("button", { name: "1 hour" })).toBeEnabled();
  });

  it("can be dismissed without setting anything", async () => {
    const onDismiss = renderPrompt();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Dismiss reminder suggestion" }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

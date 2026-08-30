import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowUpPrompt, offeredIntervals } from "./FollowUpPrompt";
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

describe("offeredIntervals", () => {
  // These used to be filtered by how much of the day was left, because a follow-up that crossed
  // midnight was refused outright. Reminder.startsAt made that expressible, so every interval is
  // now offered at any hour - late at night included, which is exactly when a six-hour gap needs
  // to be able to reach into tomorrow.
  it("offers every interval regardless of the hour", () => {
    expect(offeredIntervals().map((i: { minutes: number }) => i.minutes)).toEqual([
      30, 60, 120, 240,
    ]);
  });
});

describe("FollowUpPrompt", () => {
  it("offers the intervals that still fit today", () => {
    renderPrompt();

    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 hours" })).toBeInTheDocument();
  });

  it("still offers every interval late at night, when one would land tomorrow", () => {
    vi.setSystemTime(new Date(2026, 7, 29, 23, 45, 0));
    renderPrompt();

    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 hours" })).toBeInTheDocument();
  });

  it("asks the server for the follow-up and reports the time it will fire", async () => {
    apiFetchMock.mockResolvedValue({ firesAtLocal: "13:00", firesTomorrow: false });
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
    expect(screen.queryByText(/tomorrow/)).not.toBeInTheDocument();
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

  // "at 03:46" on its own reads as this morning, which is already past. Once a follow-up can land
  // on the other side of midnight, the day has to be said out loud.
  it("says tomorrow when the follow-up lands after midnight", async () => {
    apiFetchMock.mockResolvedValue({ firesAtLocal: "03:46", firesTomorrow: true });
    renderPrompt();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "4 hours" }));

    expect(await screen.findByText(/We'll remind you about Water tomorrow at/)).toBeInTheDocument();
    expect(screen.getByText("03:46")).toBeInTheDocument();
  });

  it("can be dismissed without setting anything", async () => {
    const onDismiss = renderPrompt();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Dismiss reminder suggestion" }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

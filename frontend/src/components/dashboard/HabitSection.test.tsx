import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HabitSection } from "./HabitSection";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HabitSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched habit entries, formatting each value by the habit's type", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/habits") && !url.includes("logs")) {
        return Promise.resolve(
          jsonResponse(200, [
            { id: "habit-1", userId: "user-1", name: "Exercise", type: "boolean" },
          ]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "log-1",
              userId: "user-1",
              habitId: "habit-1",
              valueBoolean: true,
              valueNumeric: null,
              valueDurationMinutes: null,
              notes: null,
              loggedAt: "2026-08-17T09:00:00.000Z",
            },
          ],
          limit: 10,
          offset: 0,
          hasMore: false,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/exercise: done/i)).toBeInTheDocument();
  });

  it("shows a 'create your first habit' empty state when the user has no habits", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/habits") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/haven't created any habits yet/i)).toBeInTheDocument();
  });

  it("routes + Habit straight to habit creation when the user has none yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/habits") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitSection />);
    await screen.findByText(/haven't created any habits yet/i);

    await user.click(screen.getByRole("button", { name: "Add habit entry" }));

    expect(screen.getByText("Create your first habit")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/couldn't load your habits/i)).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when Edit is clicked, and replaces the entry in place on save", async () => {
    const habit = { id: "habit-1", userId: "user-1", name: "Exercise", type: "boolean" };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      habitId: "habit-1",
      valueBoolean: false,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const updatedLog = { ...existingLog, valueBoolean: true };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse(200, updatedLog));
      if (url.includes("/api/habits") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [habit]));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitSection />);
    await screen.findByText(/exercise: not done/i);

    await user.click(screen.getByRole("button", { name: /edit habit entry/i }));

    expect(screen.getByText("Edit habit entry")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/exercise: done/i)).toBeInTheDocument();
    expect(screen.queryByText(/exercise: not done/i)).not.toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/habit-logs/log-1");
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const habit = { id: "habit-1", userId: "user-1", name: "Exercise", type: "boolean" };
    const first = {
      id: "log-1",
      userId: "user-1",
      habitId: "habit-1",
      valueBoolean: true,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "log-2",
      userId: "user-1",
      habitId: "habit-1",
      valueBoolean: false,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/habits") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [habit]));
      }
      if (url.includes("offset=1")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [second], limit: 1, offset: 1, hasMore: false }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [first], limit: 1, offset: 0, hasMore: true }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitSection />);
    await screen.findByText(/exercise: done/i);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText(/exercise: not done/i)).toBeInTheDocument();
    expect(screen.getByText(/exercise: done/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
});

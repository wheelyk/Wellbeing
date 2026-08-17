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
        jsonResponse(200, [
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
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/exercise: done/i)).toBeInTheDocument();
  });

  it("shows a 'create your first habit' empty state when the user has no habits", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/haven't created any habits yet/i)).toBeInTheDocument();
  });

  it("routes + Habit straight to habit creation when the user has none yet", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitSection />);
    await screen.findByText(/haven't created any habits yet/i);

    await user.click(screen.getByRole("button", { name: "+ Habit" }));

    expect(screen.getByText("Create your first habit")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitSection />);

    expect(await screen.findByText(/couldn't load your habits/i)).toBeInTheDocument();
  });
});

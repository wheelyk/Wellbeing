import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodSection } from "./MoodSection";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MoodSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched mood entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          id: "log-1",
          userId: "user-1",
          mood: 4,
          energy: 5,
          stress: null,
          notes: "Good day",
          loggedAt: "2026-08-17T09:00:00.000Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/mood 4\/5/i)).toBeInTheDocument();
    expect(screen.getByText("Good day")).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/couldn't load your mood entries/i)).toBeInTheDocument();
  });

  it("deletes an entry optimistically, calling the DELETE endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            id: "log-1",
            userId: "user-1",
            mood: 3,
            energy: null,
            stress: null,
            notes: null,
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: "Deleted" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findByText(/mood 3\/5/i);

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
    const [, deleteCall] = fetchMock.mock.calls;
    expect(deleteCall[0]).toContain("/api/mood-logs/log-1");
    expect(deleteCall[1]).toMatchObject({ method: "DELETE" });
  });
});

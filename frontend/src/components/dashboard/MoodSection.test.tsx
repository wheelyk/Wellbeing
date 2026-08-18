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
      jsonResponse(200, {
        entries: [
          {
            id: "log-1",
            userId: "user-1",
            mood: 4,
            energy: 5,
            stress: null,
            notes: "Good day",
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ],
        limit: 10,
        offset: 0,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/mood 4\/5/i)).toBeInTheDocument();
    expect(screen.getByText("Good day")).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const first = {
      id: "log-1",
      userId: "user-1",
      mood: 4,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "log-2",
      userId: "user-1",
      mood: 2,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
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

    render(<MoodSection />);
    await screen.findByText(/mood 4\/5/i);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText(/mood 2\/5/i)).toBeInTheDocument();
    expect(screen.getByText(/mood 4\/5/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
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
        jsonResponse(200, {
          entries: [
            {
              id: "log-1",
              userId: "user-1",
              mood: 3,
              energy: null,
              stress: null,
              notes: null,
              loggedAt: "2026-08-17T09:00:00.000Z",
            },
          ],
          limit: 10,
          offset: 0,
          hasMore: false,
        }),
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

  it("opens the edit form pre-filled when Edit is clicked, and replaces the entry in place on save", async () => {
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      mood: 3,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const updatedLog = { ...existingLog, mood: 5 };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(jsonResponse(200, updatedLog));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findByText(/mood 3\/5/i);

    await user.click(screen.getByRole("button", { name: /edit mood entry/i }));

    expect(screen.getByText("Edit mood entry")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Neutral" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "Great" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/mood 5\/5/i)).toBeInTheDocument();
    // Replaced in place, not prepended - only one entry in the list either way.
    expect(screen.getAllByText(/mood \d\/5/i)).toHaveLength(1);
    expect(screen.queryByText("Edit mood entry")).not.toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/mood-logs/log-1");
  });
});

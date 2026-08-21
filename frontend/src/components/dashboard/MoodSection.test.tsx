import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodSection } from "./MoodSection";
import { DASHBOARD_ENTRY_CHANGED_EVENT } from "../../lib/dashboardEntryChangedEvent";

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

  it("opens the entry form when the add button is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findByText(/nothing logged yet/i);

    await user.click(screen.getByRole("button", { name: "Add mood entry" }));

    expect(screen.getByText("Log your mood")).toBeInTheDocument();
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

  it("shows Load less once more than a page is loaded, and it collapses back without a new fetch", async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      userId: "user-1",
      mood: 3,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: `2026-08-17T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
    }));
    const eleventh = {
      id: "log-10",
      userId: "user-1",
      mood: 5,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("offset=10")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [eleventh], limit: 10, offset: 10, hasMore: false }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { entries: firstPage, limit: 10, offset: 0, hasMore: true }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findAllByText(/mood 3\/5/i);
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText(/mood 5\/5/i);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load less/i })).toBeInTheDocument();

    const callsBeforeLoadLess = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /load less/i }));

    // Purely a local truncation - no additional fetch, and the just-loaded 11th entry is gone
    // again while the original 10 stay put.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeLoadLess);
    expect(screen.queryByText(/mood 5\/5/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/mood 3\/5/i)).toHaveLength(10);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MoodSection />);

    expect(await screen.findByText(/couldn't load your mood entries/i)).toBeInTheDocument();
  });

  it("deletes an entry optimistically once the confirmation is accepted", async () => {
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findByText(/mood 3\/5/i);

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete this mood entry/i));
    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
    const [, deleteCall] = fetchMock.mock.calls;
    expect(deleteCall[0]).toContain("/api/mood-logs/log-1");
    expect(deleteCall[1]).toMatchObject({ method: "DELETE" });
  });

  it("does not delete when the confirmation is declined (per §15 destructive-action confirmation)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<MoodSection />);
    await screen.findByText(/mood 3\/5/i);

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

    // Entry is still there, and no DELETE call was ever made - just the one initial GET.
    expect(screen.getByText(/mood 3\/5/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    // Success feedback: a brief confirmation appears once the form closes (there's no toast
    // system in this app - see hooks/useTimedMessage.ts).
    expect(screen.getByRole("status")).toHaveTextContent(/mood entry saved/i);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/mood-logs/log-1");
  });

  // Covers the "DashboardSummary refetches instantly on a real save/delete" fix - see
  // dashboardEntryChangedEvent.ts. This section's own dispatch calls are the thing under test
  // here, so a real listener (not a dispatchEvent spy) confirms the event a real consumer would
  // actually receive, including its `detail` type.
  it("dispatches a dashboard-entry-changed event once a new mood entry is saved", async () => {
    const createdLog = {
      id: "log-new",
      userId: "user-1",
      mood: 5,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, createdLog));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onEntryChanged = vi.fn();
    window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);

    try {
      render(<MoodSection />);
      await screen.findByText(/nothing logged yet/i);

      await user.click(screen.getByRole("button", { name: "Add mood entry" }));
      await user.click(screen.getByRole("radio", { name: "Great" }));
      await user.click(screen.getByRole("button", { name: /save entry/i }));

      expect(await screen.findByText(/mood 5\/5/i)).toBeInTheDocument();
      expect(onEntryChanged).toHaveBeenCalledTimes(1);
      expect((onEntryChanged.mock.calls[0][0] as CustomEvent).detail).toBe("mood");
    } finally {
      window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);
    }
  });

  it("dispatches a dashboard-entry-changed event once a mood entry is deleted", async () => {
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onEntryChanged = vi.fn();
    window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);

    try {
      render(<MoodSection />);
      await screen.findByText(/mood 3\/5/i);

      await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

      await screen.findByText(/nothing logged yet/i);
      expect(onEntryChanged).toHaveBeenCalledTimes(1);
      expect((onEntryChanged.mock.calls[0][0] as CustomEvent).detail).toBe("mood");
    } finally {
      window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);
    }
  });

  it("does not dispatch a dashboard-entry-changed event when a delete fails and is rolled back", async () => {
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
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const onEntryChanged = vi.fn();
    window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);

    try {
      render(<MoodSection />);
      await screen.findByText(/mood 3\/5/i);

      await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

      // Rolled back after the failed DELETE - the entry reappears, and nothing should have told
      // DashboardSummary anything changed, since nothing actually did.
      expect(await screen.findByText(/mood 3\/5/i)).toBeInTheDocument();
      expect(onEntryChanged).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, onEntryChanged);
    }
  });
});

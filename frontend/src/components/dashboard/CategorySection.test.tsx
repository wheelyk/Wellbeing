import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategorySection } from "./CategorySection";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function logPage(entries: unknown[]) {
  return jsonResponse(200, { entries, limit: 10, offset: 0, hasMore: false });
}

describe("CategorySection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gives an already-logged category its own 'Recent <name>' card showing just the value", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(
          jsonResponse(200, [
            {
              id: "cat-1",
              userId: "user-1",
              name: "Water intake",
              icon: "💧",
              valueType: "numeric",
              scaleMin: null,
              scaleMax: null,
              archivedAt: null,
              createdAt: "2026-08-23T00:00:00.000Z",
              hidden: false,
              lastLoggedAt: "2026-08-23T09:00:00.000Z",
            },
          ]),
        );
      }
      return Promise.resolve(
        logPage([
          {
            id: "log-1",
            userId: "user-1",
            categoryId: "cat-1",
            valueBoolean: null,
            valueNumeric: 6,
            valueDurationMinutes: null,
            notes: null,
            loggedAt: "2026-08-23T09:00:00.000Z",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CategorySection />);

    expect(await screen.findByText("Recent 💧 Water intake")).toBeInTheDocument();
    expect(await screen.findByText("6")).toBeInTheDocument();
  });

  it("gives a never-logged category no card of its own", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(
          jsonResponse(200, [
            {
              id: "cat-1",
              userId: "user-1",
              name: "Reading",
              icon: null,
              valueType: "boolean",
              scaleMin: null,
              scaleMax: null,
              archivedAt: null,
              createdAt: "2026-08-23T00:00:00.000Z",
              hidden: false,
              lastLoggedAt: null,
            },
          ]),
        );
      }
      return Promise.resolve(logPage([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CategorySection />);

    await screen.findByText("Log a category");
    expect(screen.queryByText("Recent Reading")).not.toBeInTheDocument();
  });

  it("shows a 'create your first category' empty state when the user has none yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(logPage([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CategorySection />);

    expect(await screen.findByText(/haven't created any categories yet/i)).toBeInTheDocument();
  });

  it("routes the + button straight to category creation when the user has none yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(logPage([]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText(/haven't created any categories yet/i);

    await user.click(screen.getByRole("button", { name: "Add category entry" }));

    expect(screen.getByText("Create your first category")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategorySection />);

    expect(await screen.findByText(/couldn't load your categories/i)).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when Edit is clicked, and replaces the entry in place on save", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Read today",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: "2026-08-23T09:00:00.000Z",
    };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: false,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const updatedLog = { ...existingLog, valueBoolean: true };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse(200, updatedLog));
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      return Promise.resolve(logPage([existingLog]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText("Not done");

    await user.click(screen.getByRole("button", { name: /edit entry/i }));

    expect(screen.getByText("Edit entry")).toBeInTheDocument();
    // The picker is hidden for a card's own edit form - only the Yes/No value is editable here.
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("Not done")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/entry saved/i);
  });

  it("removes a category's card once its last entry is deleted", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Read today",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: "2026-08-23T09:00:00.000Z",
    };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: true,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.resolve(jsonResponse(200, { message: "Deleted" }));
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      return Promise.resolve(logPage([existingLog]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CategorySection />);
    await screen.findByText("Recent Read today");
    await screen.findByText("Done");

    await user.click(screen.getByRole("button", { name: /delete entry/i }));

    await waitFor(() => expect(screen.queryByText("Recent Read today")).not.toBeInTheDocument());
  });

  it("promotes a category into its own card once logged for the first time via the discovery flow", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Meditation",
      icon: null,
      valueType: "duration",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: null,
    };
    const newLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: null,
      valueDurationMinutes: 15,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/category-logs")) {
        return Promise.resolve(jsonResponse(201, newLog));
      }
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      return Promise.resolve(logPage([]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText("Log a category");
    expect(screen.queryByText(/recent meditation/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add category entry" }));
    expect(screen.getByText("Log an entry")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Duration (minutes)"), "15");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText("Recent Meditation")).toBeInTheDocument();
  });

  // Regression test: the discovery picker used to only offer categories with no card of their
  // own yet ("undiscovered"), which meant an already-carded category (e.g. logging "Headache"
  // again) simply didn't appear as an option here at all - direct user feedback reported this as
  // a real usability problem on the live app, not a hypothetical one.
  it("offers an already-carded category as an option in the discovery picker too", async () => {
    const carded = {
      id: "cat-1",
      userId: "user-1",
      name: "Headache",
      icon: null,
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 10,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: "2026-08-23T09:00:00.000Z",
    };
    const uncarded = {
      id: "cat-2",
      userId: "user-1",
      name: "Reading",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: null,
    };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: 6,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [carded, uncarded]));
      }
      return Promise.resolve(logPage([existingLog]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText("Recent Headache");

    await user.click(screen.getByRole("button", { name: "Add category entry" }));

    expect(screen.getByRole("option", { name: "Headache" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reading" })).toBeInTheDocument();
  });

  // Regression test for the fix that made the above possible without going stale: logging an
  // already-carded category through the shared discovery picker has to actually reach that
  // card's own list, not just silently update the orchestrator's own state.
  it("refreshes an already-carded category's own card when logged again via the discovery flow", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Headache",
      icon: null,
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 10,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: "2026-08-23T09:00:00.000Z",
    };
    const firstLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: 6,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const secondLog = {
      id: "log-2",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: 8,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-24T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/category-logs")) {
        return Promise.resolve(jsonResponse(201, secondLog));
      }
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      // The card's own fetch happens once on mount, then again after the remount this fix
      // triggers - returning both logs the second time is what proves the card's own list
      // (not just the orchestrator's local state) actually picked up the new entry.
      if (fetchMock.mock.calls.filter((c) => String(c[0]).includes("category-logs")).length > 1) {
        return Promise.resolve(logPage([secondLog, firstLog]));
      }
      return Promise.resolve(logPage([firstLog]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText("Recent Headache");
    await screen.findByText("6/10");

    await user.click(screen.getByRole("button", { name: "Add category entry" }));
    await user.selectOptions(screen.getByLabelText("Category"), "cat-1");
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Headache" })).getByRole("radio", {
        name: "8",
      }),
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText("8/10")).toBeInTheDocument();
  });

  // Regression test for a real bug found in manual browser verification of the fix above: the
  // first version of the remount key was derived from the new log's own loggedAt, which defaults
  // to "now" truncated to the minute and is user-editable - two saves within the same clock minute
  // (very plausible: log a category, then immediately log it again at a different value) produced
  // the exact same key, so React never remounted the card and it silently stayed stale. This test
  // uses the SAME loggedAt for both logs specifically to catch that class of bug again.
  it("refreshes an already-carded category's own card even when the new log has the exact same loggedAt as the previous one", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Headache",
      icon: null,
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 10,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      hidden: false,
      lastLoggedAt: "2026-08-23T09:00:00.000Z",
    };
    const firstLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: 6,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const secondLog = {
      id: "log-2",
      userId: "user-1",
      categoryId: "cat-1",
      valueBoolean: null,
      valueNumeric: 9,
      valueDurationMinutes: null,
      notes: null,
      // Deliberately identical to firstLog.loggedAt - see the test's own comment above.
      loggedAt: "2026-08-23T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/category-logs")) {
        return Promise.resolve(jsonResponse(201, secondLog));
      }
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      if (fetchMock.mock.calls.filter((c) => String(c[0]).includes("category-logs")).length > 1) {
        return Promise.resolve(logPage([secondLog, firstLog]));
      }
      return Promise.resolve(logPage([firstLog]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText("Recent Headache");
    await screen.findByText("6/10");

    await user.click(screen.getByRole("button", { name: "Add category entry" }));
    await user.selectOptions(screen.getByLabelText("Category"), "cat-1");
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Headache" })).getByRole("radio", {
        name: "9",
      }),
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText("9/10")).toBeInTheDocument();
  });
});

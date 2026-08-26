import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

    await screen.findByText(/haven't tracked yet/i);
    expect(screen.queryByText("Recent Read today")).not.toBeInTheDocument();
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
});

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

describe("CategorySection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched category entries, formatting each value by the category's type", async () => {
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
            },
          ]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
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
          ],
          limit: 10,
          offset: 0,
          hasMore: false,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CategorySection />);

    expect(await screen.findByText(/water intake: 6/i)).toBeInTheDocument();
  });

  it("shows a 'create your first category' empty state when the user has none yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories") && !url.includes("logs")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
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
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
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
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategorySection />);
    await screen.findByText(/read today: not done/i);

    await user.click(screen.getByRole("button", { name: /edit entry/i }));

    expect(screen.getByText("Edit entry")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/read today: done/i)).toBeInTheDocument();
    expect(screen.queryByText(/read today: not done/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/entry saved/i);
  });

  it("deletes an entry only once the confirmation is accepted", async () => {
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
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<CategorySection />);
    await screen.findByText(/read today: done/i);

    await user.click(screen.getByRole("button", { name: /delete entry/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete this entry/i));
    expect(screen.getByText(/read today: done/i)).toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /delete entry/i }));

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });
});

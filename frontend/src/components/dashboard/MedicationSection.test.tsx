import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationSection } from "./MedicationSection";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MedicationSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched medication entries, resolving the medication name", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "med-1", userId: "user-1", name: "Ibuprofen" }]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "log-1",
              userId: "user-1",
              medicationId: "med-1",
              taken: true,
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

    render(<MedicationSection />);

    expect(await screen.findByText(/ibuprofen — taken/i)).toBeInTheDocument();
  });

  it("opens the entry form when the add button is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MedicationSection />);
    await screen.findByText(/nothing logged yet/i);

    await user.click(screen.getByRole("button", { name: "Add medication entry" }));

    expect(screen.getByText("Log a medication")).toBeInTheDocument();
  });

  it("includes the medication's dosage in the entry label when it has one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "med-1", userId: "user-1", name: "Diazepam", dosage: "2mg" }]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "log-1",
              userId: "user-1",
              medicationId: "med-1",
              taken: true,
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

    render(<MedicationSection />);

    expect(await screen.findByText(/diazepam — 2mg — taken/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const first = {
      id: "log-1",
      userId: "user-1",
      medicationId: "med-1",
      taken: true,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "log-2",
      userId: "user-1",
      medicationId: "med-1",
      taken: false,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "med-1", userId: "user-1", name: "Ibuprofen" }]),
        );
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

    render(<MedicationSection />);
    await screen.findByText(/ibuprofen — taken/i);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText(/ibuprofen — not taken/i)).toBeInTheDocument();
    expect(screen.getByText(/ibuprofen — taken/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/couldn't load your medications/i)).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when Edit is clicked, and replaces the entry in place on save", async () => {
    const medication = { id: "med-1", userId: "user-1", name: "Ibuprofen", dosage: null };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      medicationId: "med-1",
      taken: false,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const updatedLog = { ...existingLog, taken: true };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse(200, updatedLog));
      if (url.includes("/api/medications")) return Promise.resolve(jsonResponse(200, [medication]));
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MedicationSection />);
    await screen.findByText(/ibuprofen — not taken/i);

    await user.click(screen.getByRole("button", { name: /edit medication entry/i }));

    expect(screen.getByText("Edit medication entry")).toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "Taken" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/ibuprofen — taken/i)).toBeInTheDocument();
    expect(screen.queryByText(/not taken/i)).not.toBeInTheDocument();
    // Success feedback: a brief confirmation appears once the form closes (there's no toast
    // system in this app - see hooks/useTimedMessage.ts).
    expect(screen.getByRole("status")).toHaveTextContent(/medication entry saved/i);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/medication-logs/log-1");
  });

  it("deletes an entry only once the confirmation is accepted", async () => {
    const medication = { id: "med-1", userId: "user-1", name: "Ibuprofen" };
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      medicationId: "med-1",
      taken: true,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.resolve(jsonResponse(200, { message: "Deleted" }));
      if (url.includes("/api/medications")) return Promise.resolve(jsonResponse(200, [medication]));
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<MedicationSection />);
    await screen.findByText(/ibuprofen — taken/i);

    await user.click(screen.getByRole("button", { name: /delete medication entry/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete this medication entry/i));
    expect(screen.getByText(/ibuprofen — taken/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/medication-logs/log-1"),
      expect.objectContaining({ method: "DELETE" }),
    );

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /delete medication entry/i }));

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });
});

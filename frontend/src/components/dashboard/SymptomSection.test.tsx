import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymptomSection } from "./SymptomSection";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SymptomSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched symptom entries, resolving the symptom name", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/symptoms")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "sym-1", userId: null, name: "Headache", description: null }]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "log-1",
              userId: "user-1",
              symptomId: "sym-1",
              severity: 7,
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

    render(<SymptomSection />);

    expect(await screen.findByText(/headache · severity 7\/10/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/symptoms")) return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const first = {
      id: "log-1",
      userId: "user-1",
      symptomId: "sym-1",
      severity: 7,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "log-2",
      userId: "user-1",
      symptomId: "sym-1",
      severity: 4,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/symptoms")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "sym-1", userId: null, name: "Headache", description: null }]),
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

    render(<SymptomSection />);
    await screen.findByText(/headache · severity 7\/10/i);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText(/headache · severity 4\/10/i)).toBeInTheDocument();
    expect(screen.getByText(/headache · severity 7\/10/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows Load less once more than a page is loaded, and it collapses back without a new fetch", async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      userId: "user-1",
      symptomId: "sym-1",
      severity: 6,
      notes: null,
      loggedAt: `2026-08-17T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
    }));
    const eleventh = {
      id: "log-10",
      userId: "user-1",
      symptomId: "sym-1",
      severity: 9,
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/symptoms")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "sym-1", userId: null, name: "Headache", description: null }]),
        );
      }
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

    render(<SymptomSection />);
    await screen.findAllByText(/headache · severity 6\/10/i);
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText(/headache · severity 9\/10/i);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load less/i })).toBeInTheDocument();

    const callsBeforeLoadLess = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /load less/i }));

    expect(fetchMock.mock.calls.length).toBe(callsBeforeLoadLess);
    expect(screen.queryByText(/headache · severity 9\/10/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/headache · severity 6\/10/i)).toHaveLength(10);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomSection />);

    expect(await screen.findByText(/couldn't load your symptom entries/i)).toBeInTheDocument();
  });

  it("opens the entry form when + Symptom is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/symptoms")) return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SymptomSection />);
    await screen.findByText(/nothing logged yet/i);

    await user.click(screen.getByRole("button", { name: "Add symptom entry" }));

    expect(screen.getByText("Log a symptom")).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when Edit is clicked, and replaces the entry in place on save", async () => {
    const symptoms = [{ id: "sym-1", userId: null, name: "Headache", description: null }];
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      symptomId: "sym-1",
      severity: 3,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const updatedLog = { ...existingLog, severity: 8 };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse(200, updatedLog));
      if (url.includes("/api/symptoms")) return Promise.resolve(jsonResponse(200, symptoms));
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SymptomSection />);
    await screen.findByText(/headache · severity 3\/10/i);

    await user.click(screen.getByRole("button", { name: /edit symptom entry/i }));

    expect(screen.getByText("Edit symptom entry")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "8" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/headache · severity 8\/10/i)).toBeInTheDocument();
    expect(screen.queryByText(/severity 3\/10/i)).not.toBeInTheDocument();
    // Success feedback: a brief confirmation appears once the form closes (there's no toast
    // system in this app - see hooks/useTimedMessage.ts).
    expect(screen.getByRole("status")).toHaveTextContent(/symptom entry saved/i);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/symptom-logs/log-1");
  });

  it("deletes an entry only once the confirmation is accepted", async () => {
    const symptoms = [{ id: "sym-1", userId: null, name: "Headache", description: null }];
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      symptomId: "sym-1",
      severity: 7,
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.resolve(jsonResponse(200, { message: "Deleted" }));
      if (url.includes("/api/symptoms")) return Promise.resolve(jsonResponse(200, symptoms));
      return Promise.resolve(
        jsonResponse(200, { entries: [existingLog], limit: 10, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    // First: declining the confirmation must not delete or call the network.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<SymptomSection />);
    await screen.findByText(/headache · severity 7\/10/i);

    await user.click(screen.getByRole("button", { name: /delete symptom entry/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete this symptom entry/i));
    expect(screen.getByText(/headache · severity 7\/10/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/symptom-logs/log-1"),
      expect.objectContaining({ method: "DELETE" }),
    );

    // Then: accepting the confirmation deletes as normal.
    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /delete symptom entry/i }));

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });
});

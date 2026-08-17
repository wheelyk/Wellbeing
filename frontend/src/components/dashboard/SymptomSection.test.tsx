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
        jsonResponse(200, [
          {
            id: "log-1",
            userId: "user-1",
            symptomId: "sym-1",
            severity: 7,
            notes: null,
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomSection />);

    expect(await screen.findByText(/headache · severity 7\/10/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomSection />);

    expect(await screen.findByText(/couldn't load your symptom entries/i)).toBeInTheDocument();
  });

  it("opens the entry form when + Symptom is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SymptomSection />);
    await screen.findByText(/nothing logged yet/i);

    await user.click(screen.getByRole("button", { name: "+ Symptom" }));

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
      return Promise.resolve(jsonResponse(200, [existingLog]));
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

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toContain("/api/symptom-logs/log-1");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
        jsonResponse(200, [
          {
            id: "log-1",
            userId: "user-1",
            medicationId: "med-1",
            taken: true,
            notes: null,
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/ibuprofen — taken/i)).toBeInTheDocument();
  });

  it("includes the medication's dosage in the entry label when it has one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/medications")) {
        return Promise.resolve(
          jsonResponse(200, [{ id: "med-1", userId: "user-1", name: "Diazepam", dosage: "2mg" }]),
        );
      }
      return Promise.resolve(
        jsonResponse(200, [
          {
            id: "log-1",
            userId: "user-1",
            medicationId: "med-1",
            taken: true,
            notes: null,
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/diazepam — 2mg — taken/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationSection />);

    expect(await screen.findByText(/couldn't load your medications/i)).toBeInTheDocument();
  });
});

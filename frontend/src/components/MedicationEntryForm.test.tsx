import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationEntryForm, type Medication, type MedicationLog } from "./MedicationEntryForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const existingMedication: Medication = {
  id: "med-1",
  userId: "user-1",
  name: "Ibuprofen",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function mockMedicationsList(medications: Medication[]) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/api/medications") && !init?.method) {
      return Promise.resolve(jsonResponse(200, medications));
    }
    return Promise.resolve(jsonResponse(404, {}));
  });
}

describe("MedicationEntryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the user's medications and requires one to be selected before submitting", async () => {
    vi.stubGlobal("fetch", mockMedicationsList([existingMedication]));
    const user = userEvent.setup();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByRole("radio", { name: "Ibuprofen" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Taken" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose which medication/i)).toBeInTheDocument();
  });

  it("requires taken/not-taken to be chosen before submitting", async () => {
    vi.stubGlobal("fetch", mockMedicationsList([existingMedication]));
    const user = userEvent.setup();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: "Ibuprofen" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose whether it was taken/i)).toBeInTheDocument();
  });

  it("submits the selected medication, taken status, and optional fields, calling onSaved with the created log and medication", async () => {
    const createdLog: MedicationLog = {
      id: "log-1",
      userId: "user-1",
      medicationId: "med-1",
      taken: true,
      notes: "With breakfast",
      loggedAt: "2026-08-16T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/medications") && !init?.method) {
        return Promise.resolve(jsonResponse(200, [existingMedication]));
      }
      if (url.endsWith("/api/medication-logs") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, createdLog));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(<MedicationEntryForm onSaved={onSaved} onCancel={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: "Ibuprofen" }));
    await user.click(screen.getByRole("radio", { name: "Taken" }));
    await user.type(screen.getByLabelText(/notes/i), "With breakfast");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog, existingMedication));

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        (url as string).endsWith("/api/medication-logs") &&
        (init as RequestInit)?.method === "POST",
    );
    if (!postCall) throw new Error("Expected a POST to /api/medication-logs");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body.medicationId).toBe("med-1");
    expect(body.taken).toBe(true);
    expect(body.notes).toBe("With breakfast");
    expect(body.loggedAt).toBeDefined();
  });

  it("shows a friendly error when saving the log fails", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/medications") && !init?.method) {
        return Promise.resolve(jsonResponse(200, [existingMedication]));
      }
      if (url.endsWith("/api/medication-logs") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(400, {
            error: { message: "Invalid medication log", code: "VALIDATION_ERROR" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: "Ibuprofen" }));
    await user.click(screen.getByRole("radio", { name: "Not taken" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(
      await screen.findByText(/something went wrong saving your medication entry/i),
    ).toBeInTheDocument();
  });

  it("lets a user with no medications yet add one, which is then auto-selected", async () => {
    const newMedication: Medication = {
      id: "med-2",
      userId: "user-1",
      name: "Vitamin D",
      createdAt: "2026-08-16T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/medications") && !init?.method) {
        return Promise.resolve(jsonResponse(200, []));
      }
      if (url.endsWith("/api/medications") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, newMedication));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    const nameInput = await screen.findByLabelText(/medication name/i);
    await user.type(nameInput, "Vitamin D");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(
      await screen.findByRole("radio", { name: "Vitamin D", checked: true }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    vi.stubGlobal("fetch", mockMedicationsList([existingMedication]));
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

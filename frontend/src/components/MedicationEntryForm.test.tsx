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
  dosage: null,
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
      dosage: null,
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

  it("shows a medication's dosage in the picker when it has one", async () => {
    const withDosage: Medication = {
      id: "med-3",
      userId: "user-1",
      name: "Diazepam",
      dosage: "2mg",
      createdAt: "2026-08-17T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", mockMedicationsList([withDosage]));

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole("radio", { name: /diazepam.*2mg/i })).toBeInTheDocument();
  });

  it("lets a user add a medication with a dosage, which is included in the create request", async () => {
    const newMedication: Medication = {
      id: "med-4",
      userId: "user-1",
      name: "Diazepam",
      dosage: "2mg",
      createdAt: "2026-08-17T00:00:00.000Z",
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
    await user.type(await screen.findByLabelText(/medication name/i), "Diazepam");
    await user.type(screen.getByLabelText(/dosage/i), "2mg");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(
      await screen.findByRole("radio", { name: /diazepam.*2mg/i, checked: true }),
    ).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        (url as string).endsWith("/api/medications") && (init as RequestInit)?.method === "POST",
    );
    if (!postCall) throw new Error("Expected a POST to /api/medications");
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toEqual({ name: "Diazepam", dosage: "2mg" });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    vi.stubGlobal("fetch", mockMedicationsList([existingMedication]));
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<MedicationEntryForm onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  describe("editing an existing entry", () => {
    const existingLog: MedicationLog = {
      id: "log-1",
      userId: "user-1",
      medicationId: "med-1",
      taken: false,
      notes: "Skipped",
      loggedAt: "2026-08-16T08:30:00.000Z",
    };

    it("pre-fills the medication, taken status, and notes from the entry being edited", async () => {
      vi.stubGlobal("fetch", mockMedicationsList([existingMedication]));

      render(<MedicationEntryForm editingLog={existingLog} onSaved={vi.fn()} onCancel={vi.fn()} />);

      expect(
        await screen.findByRole("radio", { name: "Ibuprofen", checked: true }),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Not taken" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByLabelText(/notes/i)).toHaveValue("Skipped");
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    });

    it("submits a PATCH to the entry's own URL instead of a POST, calling onSaved with the updated log and medication", async () => {
      const updatedLog: MedicationLog = { ...existingLog, taken: true, notes: "Taken late" };
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/api/medications") && !init?.method) {
          return Promise.resolve(jsonResponse(200, [existingMedication]));
        }
        if (init?.method === "PATCH") {
          return Promise.resolve(jsonResponse(200, updatedLog));
        }
        return Promise.resolve(jsonResponse(404, {}));
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      const onSaved = vi.fn();

      render(<MedicationEntryForm editingLog={existingLog} onSaved={onSaved} onCancel={vi.fn()} />);
      await screen.findByRole("radio", { name: "Ibuprofen" });
      await user.click(screen.getByRole("radio", { name: "Taken" }));
      const notesField = screen.getByLabelText(/notes/i);
      await user.clear(notesField);
      await user.type(notesField, "Taken late");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedLog, existingMedication));

      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      if (!patchCall) throw new Error("Expected a PATCH to /api/medication-logs/log-1");
      expect(patchCall[0]).toContain("/api/medication-logs/log-1");
      const body = JSON.parse((patchCall[1] as RequestInit).body as string);
      expect(body.taken).toBe(true);
      expect(body.notes).toBe("Taken late");
    });
  });
});

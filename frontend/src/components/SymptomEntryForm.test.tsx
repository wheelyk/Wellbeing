import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymptomEntryForm, type Symptom } from "./SymptomEntryForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SYSTEM_SYMPTOMS: Symptom[] = [
  {
    id: "sys-1",
    userId: null,
    name: "Headache",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "sys-2",
    userId: null,
    name: "Fatigue",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const OWN_SYMPTOM: Symptom = {
  id: "own-1",
  userId: "user-1",
  name: "Joint pain",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("SymptomEntryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a symptom and a severity to be chosen before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose a symptom/i)).toBeInTheDocument();
    expect(await screen.findByText(/choose a severity/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("groups system and the user's own symptoms into separate optgroups", () => {
    render(
      <SymptomEntryForm
        symptoms={[...SYSTEM_SYMPTOMS, OWN_SYMPTOM]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "Your symptoms" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Common symptoms" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Joint pain" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Headache" })).toBeInTheDocument();
  });

  it("submits the selected symptom, severity, and optional fields, calling onSaved with the created log", async () => {
    const createdLog = {
      id: "log-1",
      userId: "user-1",
      symptomId: "sys-1",
      severity: 7,
      notes: "Started after lunch",
      loggedAt: "2026-08-16T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdLog));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={onSaved}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/symptom/i), "sys-1");
    await user.click(screen.getByRole("radio", { name: "7" }));
    await user.type(screen.getByLabelText(/notes/i), "Started after lunch");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.symptomId).toBe("sys-1");
    expect(body.severity).toBe(7);
    expect(body.notes).toBe("Started after lunch");
    expect(body.loggedAt).toBeDefined();
  });

  it("shows a friendly error when saving fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: "Invalid symptom log", code: "VALIDATION_ERROR" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/symptom/i), "sys-1");
    await user.click(screen.getByRole("radio", { name: "3" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(
      await screen.findByText(/something went wrong saving your symptom/i),
    ).toBeInTheDocument();
  });

  it("offers severity ratings 1 through 10", () => {
    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );

    const severityGroup = screen.getByRole("radiogroup", { name: "Severity" });
    const options = severityGroup.querySelectorAll('[role="radio"]');
    expect(Array.from(options).map((o) => o.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("lets a user add their own symptom, which is then auto-selected and reported to the parent", async () => {
    const newSymptom: Symptom = {
      id: "own-2",
      userId: "user-1",
      name: "Anxiety",
      description: null,
      createdAt: "2026-08-17T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/symptoms") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, newSymptom));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSymptomCreated = vi.fn();

    const { rerender } = render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={onSymptomCreated}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add another symptom/i }));
    await user.type(screen.getByLabelText(/symptom name/i), "Anxiety");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await vi.waitFor(() => expect(onSymptomCreated).toHaveBeenCalledWith(newSymptom));

    // In the real app, onSymptomCreated causes the parent (SymptomSection) to add the new
    // symptom to the `symptoms` array it owns and re-render this form with it - simulated here
    // via rerender, since this form only holds the *id* of the selection, not the option list.
    rerender(
      <SymptomEntryForm
        symptoms={[...SYSTEM_SYMPTOMS, newSymptom]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={onSymptomCreated}
      />,
    );
    expect(screen.getByRole("option", { name: "Anxiety", selected: true })).toBeInTheDocument();

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.name).toBe("Anxiety");
  });

  it("shows an error and doesn't clear the field when adding a symptom fails", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/symptoms") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(500, {}));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onSymptomCreated={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add another symptom/i }));
    await user.type(screen.getByLabelText(/symptom name/i), "Anxiety");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText(/couldn't add that symptom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/symptom name/i)).toHaveValue("Anxiety");
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <SymptomEntryForm
        symptoms={SYSTEM_SYMPTOMS}
        onSaved={vi.fn()}
        onCancel={onCancel}
        onSymptomCreated={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  describe("editing an existing entry", () => {
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      symptomId: "sys-2",
      severity: 4,
      notes: "After lunch",
      loggedAt: "2026-08-16T08:30:00.000Z",
    };

    it("pre-fills the symptom, severity, and notes from the entry being edited", () => {
      render(
        <SymptomEntryForm
          symptoms={SYSTEM_SYMPTOMS}
          editingLog={existingLog}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
          onSymptomCreated={vi.fn()}
        />,
      );

      expect(screen.getByLabelText(/symptom/i)).toHaveValue("sys-2");
      expect(screen.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText(/notes/i)).toHaveValue("After lunch");
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    });

    it("submits a PATCH to the entry's own URL instead of a POST, calling onSaved with the updated log", async () => {
      const updatedLog = { ...existingLog, severity: 9 };
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse(200, updatedLog)));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      const onSaved = vi.fn();

      render(
        <SymptomEntryForm
          symptoms={SYSTEM_SYMPTOMS}
          editingLog={existingLog}
          onSaved={onSaved}
          onCancel={vi.fn()}
          onSymptomCreated={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("radio", { name: "9" }));
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedLog));

      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/symptom-logs/log-1");
      expect(requestInit.method).toBe("PATCH");
      const body = JSON.parse(requestInit.body as string);
      expect(body.severity).toBe(9);
      expect(body.symptomId).toBe("sys-2");
    });
  });
});

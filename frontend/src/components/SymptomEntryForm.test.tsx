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

    render(<SymptomEntryForm symptoms={SYSTEM_SYMPTOMS} onSaved={vi.fn()} onCancel={vi.fn()} />);
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

    render(<SymptomEntryForm symptoms={SYSTEM_SYMPTOMS} onSaved={onSaved} onCancel={vi.fn()} />);
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

    render(<SymptomEntryForm symptoms={SYSTEM_SYMPTOMS} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/symptom/i), "sys-1");
    await user.click(screen.getByRole("radio", { name: "3" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(
      await screen.findByText(/something went wrong saving your symptom/i),
    ).toBeInTheDocument();
  });

  it("offers severity ratings 1 through 10", () => {
    render(<SymptomEntryForm symptoms={SYSTEM_SYMPTOMS} onSaved={vi.fn()} onCancel={vi.fn()} />);

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

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<SymptomEntryForm symptoms={SYSTEM_SYMPTOMS} onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

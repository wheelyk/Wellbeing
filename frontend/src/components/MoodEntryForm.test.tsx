import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodEntryForm } from "./MoodEntryForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MoodEntryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a mood to be selected before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose how you're feeling/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the selected mood and optional fields, calling onSaved with the created log", async () => {
    const createdLog = {
      id: "log-1",
      userId: "user-1",
      mood: 4,
      energy: 3,
      stress: null,
      notes: "Feeling good",
      loggedAt: "2026-08-15T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdLog));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(<MoodEntryForm onSaved={onSaved} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Good" }));
    const energyGroup = screen.getByRole("radiogroup", { name: "Energy (optional)" });
    await user.click(within(energyGroup).getByText("3"));
    await user.type(screen.getByLabelText(/notes/i), "Feeling good");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.mood).toBe(4);
    expect(body.notes).toBe("Feeling good");
    expect(body.loggedAt).toBeDefined();
  });

  it("shows a friendly error when saving fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: "Invalid mood log", code: "VALIDATION_ERROR" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MoodEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Bad" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/something went wrong saving your mood/i)).toBeInTheDocument();
  });

  it("explains what each end of the energy and stress scales means", () => {
    render(<MoodEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("1 = No energy · 7 = Maximum energy")).toBeInTheDocument();
    expect(screen.getByText("1 = No stress · 7 = Maximum stress")).toBeInTheDocument();
  });

  it("offers energy/stress ratings 1 through 7, with a true midpoint at 4", async () => {
    const user = userEvent.setup();
    render(<MoodEntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);

    const energyGroup = screen.getByRole("radiogroup", { name: "Energy (optional)" });
    const options = within(energyGroup).getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);

    const midpoint = within(energyGroup).getByText("4");
    await user.click(midpoint);
    expect(midpoint).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<MoodEntryForm onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  describe("editing an existing entry", () => {
    const existingLog = {
      id: "log-1",
      userId: "user-1",
      mood: 2,
      energy: 5,
      stress: 6,
      notes: "Rough morning",
      loggedAt: "2026-08-16T08:30:00.000Z",
    };

    it("pre-fills every field from the entry being edited", () => {
      render(<MoodEntryForm editingLog={existingLog} onSaved={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole("radio", { name: "Not great" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      const energyGroup = screen.getByRole("radiogroup", { name: "Energy (optional)" });
      expect(within(energyGroup).getByText("5")).toHaveAttribute("aria-checked", "true");
      const stressGroup = screen.getByRole("radiogroup", { name: "Stress (optional)" });
      expect(within(stressGroup).getByText("6")).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText(/notes/i)).toHaveValue("Rough morning");
    });

    it("labels the submit button Save Changes instead of Save Entry", () => {
      render(<MoodEntryForm editingLog={existingLog} onSaved={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save Entry" })).not.toBeInTheDocument();
    });

    it("submits a PATCH to the entry's own URL instead of a POST, calling onSaved with the updated log", async () => {
      const updatedLog = { ...existingLog, mood: 5, notes: "Feeling better now" };
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse(200, updatedLog)));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      const onSaved = vi.fn();

      render(<MoodEntryForm editingLog={existingLog} onSaved={onSaved} onCancel={vi.fn()} />);
      await user.click(screen.getByRole("radio", { name: "Great" }));
      const notesField = screen.getByLabelText(/notes/i);
      await user.clear(notesField);
      await user.type(notesField, "Feeling better now");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedLog));

      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/mood-logs/log-1");
      expect(requestInit.method).toBe("PATCH");
      const body = JSON.parse(requestInit.body as string);
      expect(body.mood).toBe(5);
      expect(body.notes).toBe("Feeling better now");
    });

    it("sends explicit nulls when clearing energy, stress, and notes, so the old values don't silently survive on the server", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse(200, existingLog)));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      render(<MoodEntryForm editingLog={existingLog} onSaved={vi.fn()} onCancel={vi.fn()} />);
      // Clicking an already-selected rating deselects it (see RatingRow) - existingLog has
      // energy 5 and stress 6, so clicking those same values again clears them.
      const energyGroup = screen.getByRole("radiogroup", { name: "Energy (optional)" });
      await user.click(within(energyGroup).getByText("5"));
      const stressGroup = screen.getByRole("radiogroup", { name: "Stress (optional)" });
      await user.click(within(stressGroup).getByText("6"));
      await user.clear(screen.getByLabelText(/notes/i));
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body as string);
      expect(body.energy).toBeNull();
      expect(body.stress).toBeNull();
      expect(body.notes).toBeNull();
    });
  });
});

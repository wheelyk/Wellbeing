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

    expect(screen.getByText("1 = No energy · 5 = Maximum energy")).toBeInTheDocument();
    expect(screen.getByText("1 = No stress · 5 = Maximum stress")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<MoodEntryForm onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

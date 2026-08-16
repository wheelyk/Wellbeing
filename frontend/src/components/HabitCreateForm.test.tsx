import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HabitCreateForm } from "./HabitCreateForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HabitCreateForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a name and a type before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /create habit/i }));

    expect(await screen.findByText(/give this habit a name/i)).toBeInTheDocument();
    expect(await screen.findByText(/choose how this habit is tracked/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a habit and calls onCreated with the server's response", async () => {
    const createdHabit = {
      id: "habit-1",
      userId: "user-1",
      name: "Exercise",
      type: "boolean",
      createdAt: "2026-08-16T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdHabit));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(<HabitCreateForm onCreated={onCreated} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/habit name/i), "Exercise");
    await user.click(screen.getByRole("radio", { name: /yes \/ no/i }));
    await user.click(screen.getByRole("button", { name: /create habit/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdHabit));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({ name: "Exercise", type: "boolean" });
  });

  it("shows a friendly error when creating fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: "Invalid habit", code: "VALIDATION_ERROR" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HabitCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/habit name/i), "Sleep");
    await user.click(screen.getByRole("radio", { name: /duration/i }));
    await user.click(screen.getByRole("button", { name: /create habit/i }));

    expect(
      await screen.findByText(/something went wrong creating your habit/i),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<HabitCreateForm onCreated={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HabitEntryForm } from "./HabitEntryForm";
import type { Habit } from "./HabitCreateForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const booleanHabit: Habit = {
  id: "habit-bool",
  userId: "user-1",
  name: "Exercise",
  type: "boolean",
  createdAt: "2026-08-16T00:00:00.000Z",
};
const numericHabit: Habit = {
  id: "habit-numeric",
  userId: "user-1",
  name: "Water intake",
  type: "numeric",
  createdAt: "2026-08-16T00:00:00.000Z",
};
const durationHabit: Habit = {
  id: "habit-duration",
  userId: "user-1",
  name: "Walking",
  type: "duration",
  createdAt: "2026-08-16T00:00:00.000Z",
};

describe("HabitEntryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a Yes/No choice before submitting a boolean habit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HabitEntryForm
        habits={[booleanHabit]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddHabit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose yes or no/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits valueBoolean for a boolean habit", async () => {
    const createdLog = {
      id: "log-1",
      userId: "user-1",
      habitId: booleanHabit.id,
      valueBoolean: true,
      valueNumeric: null,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-16T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdLog));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <HabitEntryForm
        habits={[booleanHabit]}
        onSaved={onSaved}
        onCancel={vi.fn()}
        onAddHabit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({ habitId: booleanHabit.id, valueBoolean: true });
    expect(body.valueNumeric).toBeUndefined();
  });

  it("submits valueNumeric for a numeric habit, rejecting a blank value", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HabitEntryForm
        habits={[numericHabit]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddHabit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));
    expect(await screen.findByText(/enter a number/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const createdLog = {
      id: "log-2",
      userId: "user-1",
      habitId: numericHabit.id,
      valueBoolean: null,
      valueNumeric: 2.5,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-16T12:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(201, createdLog));
    await user.type(screen.getByLabelText(/^value$/i), "2.5");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({ habitId: numericHabit.id, valueNumeric: 2.5 });
  });

  it("submits valueDurationMinutes for a duration habit, rejecting a negative value", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <HabitEntryForm
        habits={[durationHabit]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddHabit={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/duration \(minutes\)/i), "-5");
    await user.click(screen.getByRole("button", { name: /save entry/i }));
    expect(await screen.findByText(/enter a whole number of minutes/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches the value control when a different habit is picked", async () => {
    const user = userEvent.setup();
    render(
      <HabitEntryForm
        habits={[booleanHabit, numericHabit]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddHabit={vi.fn()}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: /completed/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^habit$/i), numericHabit.id);

    expect(screen.queryByRole("radiogroup", { name: /completed/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^value$/i)).toBeInTheDocument();
  });

  it("calls onAddHabit when '+ Add a new habit' is clicked", async () => {
    const user = userEvent.setup();
    const onAddHabit = vi.fn();

    render(
      <HabitEntryForm
        habits={[booleanHabit]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddHabit={onAddHabit}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a new habit/i }));

    expect(onAddHabit).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <HabitEntryForm
        habits={[booleanHabit]}
        onSaved={vi.fn()}
        onCancel={onCancel}
        onAddHabit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

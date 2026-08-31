import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskManager } from "./TaskManager";
import { dispatchTaskAction } from "../../lib/dashboardTaskActionEvent";
import { DASHBOARD_ENTRY_CHANGED_EVENT } from "../../lib/dashboardEntryChangedEvent";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const existingTask = {
  id: "task-1",
  title: "Phone the vet",
  notes: "ask about the booster",
  date: "2026-08-31",
  time: "12:30",
  dueAt: "2026-08-31T12:30:00.000Z",
  state: "upcoming" as const,
  when: "future" as const,
};

// A single branching fetch mock, matching this app's own "auto-handle, override only when
// needed" convention (see DashboardPage.test.tsx) - covers every route this component or its
// forms can call, so each test only overrides what it's actually about.
function mockFetch(overrides: { failSave?: boolean; failDelete?: boolean } = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/api/tasks") && init?.method === "POST") {
      if (overrides.failSave) return Promise.resolve(jsonResponse(500, { error: {} }));
      return Promise.resolve(jsonResponse(201, { ...existingTask, id: "task-new" }));
    }
    if (url.includes("/api/tasks/") && init?.method === "PATCH") {
      if (overrides.failSave) return Promise.resolve(jsonResponse(500, { error: {} }));
      const body = JSON.parse((init.body as string) ?? "{}");
      return Promise.resolve(
        jsonResponse(200, {
          ...existingTask,
          ...body,
          state: "done" in body ? (body.done ? "done" : "upcoming") : existingTask.state,
        }),
      );
    }
    if (url.includes("/api/tasks/") && init?.method === "DELETE") {
      if (overrides.failDelete) return Promise.resolve(jsonResponse(500, { error: {} }));
      return Promise.resolve(jsonResponse(200, { message: "Deleted" }));
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TaskManager", () => {
  it("opens a blank add form on an 'add' action", async () => {
    mockFetch();
    render(<TaskManager />);

    dispatchTaskAction({ type: "add" });

    expect(await screen.findByRole("dialog", { name: "Add a task" })).toBeInTheDocument();
    expect(screen.getByLabelText(/what needs doing/i)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /delete task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark done/i })).not.toBeInTheDocument();
  });

  it("rejects an empty title without ever calling the API", async () => {
    const fetchMock = mockFetch();
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "add" });
    await screen.findByRole("dialog", { name: "Add a task" });
    await user.click(screen.getByRole("button", { name: /add task/i }));

    expect(await screen.findByText(/enter what needs doing/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a task, closes, confirms, and announces the change", async () => {
    mockFetch();
    const changeHandler = vi.fn();
    window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, changeHandler);
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "add" });
    await screen.findByRole("dialog", { name: "Add a task" });
    await user.type(screen.getByLabelText(/what needs doing/i), "Phone the garage");
    await user.click(screen.getByRole("button", { name: /add task/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task added.")).toBeInTheDocument();
    expect(changeHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, changeHandler);
  });

  it("opens pre-filled on an 'edit' action, with Mark Done and Delete available", async () => {
    mockFetch();
    render(<TaskManager />);

    dispatchTaskAction({ type: "edit", task: existingTask });

    expect(await screen.findByRole("dialog", { name: "Task" })).toBeInTheDocument();
    expect(screen.getByLabelText(/what needs doing/i)).toHaveValue("Phone the vet");
    expect(screen.getByRole("button", { name: /✓ mark done/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete task/i })).toBeInTheDocument();
  });

  it("saves an edit and confirms the change", async () => {
    mockFetch();
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "edit", task: existingTask });
    await screen.findByRole("dialog", { name: "Task" });
    await user.clear(screen.getByLabelText(/what needs doing/i));
    await user.type(screen.getByLabelText(/what needs doing/i), "Phone the vet again");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task updated.")).toBeInTheDocument();
  });

  it("marks a task done from inside the open form, and closes it", async () => {
    mockFetch();
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "edit", task: existingTask });
    await screen.findByRole("dialog", { name: "Task" });
    await user.click(screen.getByRole("button", { name: /✓ mark done/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task marked done.")).toBeInTheDocument();
  });

  // Timeline's own row checkbox (docs/log/50/51) - no modal ever opens for this path at all.
  it("toggles done directly from a 'toggleDone' action, with no modal involved", async () => {
    mockFetch();
    render(<TaskManager />);

    dispatchTaskAction({ type: "toggleDone", task: existingTask });

    expect(await screen.findByText("Task marked done.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says 'reopened' when toggling a done task back open", async () => {
    mockFetch();
    render(<TaskManager />);

    dispatchTaskAction({ type: "toggleDone", task: { ...existingTask, state: "done" } });

    expect(await screen.findByText("Task reopened.")).toBeInTheDocument();
  });

  // A real bug, caught by driving this in an actual browser rather than by this file's own
  // earlier version of these two tests: toggleDone used to read `updated.state` off the PATCH
  // *response* to choose the toast, but the real backend's PATCH handler never actually returned
  // one (only GET computed it) - so the toast said "reopened" on every single toggle, in either
  // direction. This file's own mock had (accidentally) fabricated a `state` field the real API
  // never sent, which is exactly why the bug shipped past these very tests the first time. Fixed
  // on both sides: the backend now serializes `state` consistently everywhere a task is returned
  // (see routes/tasks.ts's own serializeTask), and toggleDone no longer depends on it at all -
  // this test pins the second, more robust half of that fix by mocking a PATCH response with no
  // `state` field at all and confirming the toast is still correct regardless.
  it("gets the toast direction right even if a PATCH response omits state entirely", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/tasks/") && init?.method === "PATCH") {
        const { id, title, notes, dueAt } = existingTask;
        return Promise.resolve(jsonResponse(200, { id, title, notes, dueAt }));
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TaskManager />);

    dispatchTaskAction({ type: "toggleDone", task: existingTask });

    expect(await screen.findByText("Task marked done.")).toBeInTheDocument();
  });

  it("deletes a task through the real confirmation dialog, not immediately on the first click", async () => {
    mockFetch();
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "edit", task: existingTask });
    await screen.findByRole("dialog", { name: "Task" });
    await user.click(screen.getByRole("button", { name: /delete task/i }));

    // Still open - only a confirmation dialog appeared, nothing was deleted yet.
    expect(screen.getByRole("dialog", { name: "Task" })).toBeInTheDocument();
    const confirmDialog = await screen.findByRole("dialog", { name: /delete task\?/i });

    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task deleted.")).toBeInTheDocument();
  });

  it("reports a save failure without silently losing what was typed", async () => {
    mockFetch({ failSave: true });
    render(<TaskManager />);
    const user = userEvent.setup();

    dispatchTaskAction({ type: "add" });
    await screen.findByRole("dialog", { name: "Add a task" });
    await user.type(screen.getByLabelText(/what needs doing/i), "Phone the garage");
    await user.click(screen.getByRole("button", { name: /add task/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong saving/i);
    // The dialog stays open with what was typed still in it - a failed save must not throw away
    // the user's own input.
    expect(screen.getByRole("dialog", { name: "Add a task" })).toBeInTheDocument();
    expect(screen.getByLabelText(/what needs doing/i)).toHaveValue("Phone the garage");
  });
});

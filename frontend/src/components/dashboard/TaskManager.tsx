import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Modal } from "../Modal";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { TextField } from "../TextField";
import { DateTimeField } from "../DateTimeField";
import { Button } from "../Button";
import { apiFetch } from "../../api/client";
import { toDateTimeLocalValue } from "../../lib/dateTimeLocal";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForTaskAction } from "../../lib/dashboardTaskActionEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";
import type { ApiTask } from "../../lib/timeline";

// The one-off "phone the vet" modal, sitting alongside CategoryLogger as Dashboard's second
// always-mounted, nothing-visible-of-its-own manager - see docs/log/51-one-off-tasks.md. Simpler
// than CategoryLogger in one real way: a Task has no category to pick and no value type to branch
// on, so there is only ever one form here, not a discovery-then-log sequence.
//
// How far ahead a brand-new task defaults to - "later today" is the common case this whole
// feature exists for ("phone the vet" - not "phone the vet in exactly one hour"), so the field
// starts somewhere plausible and is always just an ordinary editable field from there.
const DEFAULT_DUE_IN_MS = 60 * 60 * 1000;

type Mode = "closed" | "add" | "edit";

export function TaskManager() {
  const [mode, setMode] = useState<Mode>("closed");
  const [editingTask, setEditingTask] = useState<ApiTask | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Two independent floating toasts, the same pattern CategoryLogger already established: one
  // for success, one for failure, both rendered regardless of whether the modal itself is open -
  // Timeline's own checkbox (see `toggleDone` below) never opens it at all.
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();
  const { message: actionError, showMessage: showActionError } = useTimedMessage();

  const close = useCallback(() => {
    setMode("closed");
    setEditingTask(null);
    setConfirmingDelete(false);
  }, []);

  const openAdd = useCallback(() => {
    setEditingTask(null);
    setTitle("");
    setNotes("");
    setDueAt(toDateTimeLocalValue(new Date(Date.now() + DEFAULT_DUE_IN_MS)));
    setTitleError(null);
    setMode("add");
  }, []);

  const openEdit = useCallback((task: ApiTask) => {
    setEditingTask(task);
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueAt(toDateTimeLocalValue(new Date(task.dueAt)));
    setTitleError(null);
    setMode("edit");
  }, []);

  // Shared by the modal's own "Mark Done"/"Reopen" button (working off `editingTask`, the form
  // currently open) and Timeline's row checkbox (working off whichever task it was clicked on,
  // with no modal open at all) - one place that owns what "toggle done" actually does, not two
  // copies of the same PATCH-then-toast-then-refresh sequence.
  const toggleDone = useCallback(
    async (task: ApiTask) => {
      // Decided from the request we're about to send, not the response that comes back - a real
      // bug here (caught in a real browser, not by this file's own unit tests, whose mock had
      // quietly fabricated a `state` field the real PATCH response never actually sent) trusted
      // `updated.state` instead, and always read as `undefined`, so the toast said "reopened" on
      // every single toggle regardless of direction. Backend fixed too (see routes/tasks.ts's own
      // serializeTask), but this is simpler *and* correct on its own: we already know which
      // direction we asked for.
      const markingDone = task.state !== "done";
      setSubmitting(true);
      try {
        await apiFetch<ApiTask>(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: markingDone }),
        });
        close();
        showSavedMessage(markingDone ? "Task marked done." : "Task reopened.");
        dispatchDashboardEntryChanged();
      } catch {
        showActionError("Couldn't update that task. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [close, showSavedMessage, showActionError],
  );

  useEffect(
    () =>
      listenForTaskAction((action) => {
        if (action.type === "add") openAdd();
        else if (action.type === "edit") openEdit(action.task);
        else void toggleDone(action.task);
      }),
    [openAdd, openEdit, toggleDone],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim() === "") {
      setTitleError("Enter what needs doing.");
      return;
    }
    setTitleError(null);
    setSubmitting(true);
    try {
      const wasEditing = editingTask !== null;
      await apiFetch<ApiTask>(editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks", {
        method: editingTask ? "PATCH" : "POST",
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim() || (editingTask ? null : undefined),
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      close();
      showSavedMessage(wasEditing ? "Task updated." : "Task added.");
      dispatchDashboardEntryChanged();
    } catch {
      showActionError("Something went wrong saving this task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!editingTask) return;
    setConfirmingDelete(false);
    try {
      await apiFetch(`/api/tasks/${editingTask.id}`, { method: "DELETE" });
      close();
      showSavedMessage("Task deleted.");
      dispatchDashboardEntryChanged();
    } catch {
      showActionError("Something went wrong deleting this task. Please try again.");
    }
  }

  return (
    <>
      {savedMessage && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-success/50 bg-surface px-4 py-3 text-center text-sm font-medium text-success shadow-lg md:bottom-8"
        >
          {savedMessage}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-danger/50 bg-surface px-4 py-3 text-center text-sm text-danger shadow-lg md:bottom-8"
        >
          {actionError}
        </p>
      )}

      <Modal open={mode !== "closed"} onClose={close} title={editingTask ? "Task" : "Add a task"}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <TextField
            label="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError ?? undefined}
            placeholder="e.g. Phone the garage"
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="task-notes" className="text-sm font-medium text-text">
              Notes (optional)
            </label>
            <textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Ask about the booster jab"
              className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>

          <DateTimeField id="task-due-at" label="Due" value={dueAt} onChange={setDueAt} />

          <div className="flex gap-3">
            {editingTask && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void toggleDone(editingTask)}
                disabled={submitting}
              >
                {editingTask.state === "done" ? "Reopen" : "✓ Mark Done"}
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editingTask ? "Save Changes" : "Add Task"}
            </Button>
            {!editingTask && (
              <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
                Cancel
              </Button>
            )}
          </div>

          {editingTask && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={submitting}
            >
              Delete Task
            </Button>
          )}
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={confirmingDelete}
        title="Delete task?"
        message={editingTask ? `Delete "${editingTask.title}"? This can't be undone.` : ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

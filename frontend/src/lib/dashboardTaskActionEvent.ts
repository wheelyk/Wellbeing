import type { ApiTask } from "./timeline";

// A tiny, deliberately loose contract between TimelinePanel/QuickAddFab and TaskManager -
// dispatched as a plain DOM CustomEvent, the same mechanism dashboardQuickAddEvent.ts and
// dashboardTimelineActionEvent.ts already use for the same reason (see either one's own comment):
// none of the dispatching components need to know TaskManager exists, and it doesn't need to know
// them.
//
// Kept as its own event rather than folded into dashboardTimelineActionEvent - that one carries a
// CategoryEntryForm request (edit a log, or open the picker locked to/unlocked from a category);
// a Task is a different kind of thing entirely (no category, no value type, no log), and
// TaskManager owns its own separate modal from CategoryLogger's, not a third mode bolted onto the
// same one. See docs/log/51-one-off-tasks.md.
//
// "edit" and "toggleDone" both carry the whole task, not just its id - unlike a Timeline reminder
// row (which deliberately does *not* carry a log's full editable fields, so CategoryLogger fetches
// GET /api/category-logs/:id on open), GET /api/tasks already returns everything a Task's own
// edit form needs to pre-fill. A tap on a Timeline row already has the full record in hand; making
// TaskManager re-fetch it would just be a network round-trip for data that never left the page.
//
// "toggleDone" is Timeline's own row checkbox - a fast, no-modal path to the exact same PATCH
// (and the exact same confirmation toast) TaskManager's own "Mark Done"/"Reopen" button fires from
// inside the open form. Routed through TaskManager rather than PATCHing directly from
// TimelinePanel so there is one place that owns what "marking a task done" actually does, not two
// copies of that logic that could quietly drift.
export type TaskManagerAction =
  { type: "add" } | { type: "edit"; task: ApiTask } | { type: "toggleDone"; task: ApiTask };

export const DASHBOARD_TASK_ACTION_EVENT = "welltrack:dashboard-task-action";

export function dispatchTaskAction(action: TaskManagerAction): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_TASK_ACTION_EVENT, { detail: action }));
}

// Calls `onAction` with the action's own detail whenever one fires, for as long as the calling
// component stays mounted. Returns the cleanup function a useEffect expects.
export function listenForTaskAction(onAction: (action: TaskManagerAction) => void): () => void {
  function handler(event: Event) {
    onAction((event as CustomEvent<TaskManagerAction>).detail);
  }
  window.addEventListener(DASHBOARD_TASK_ACTION_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_TASK_ACTION_EVENT, handler);
}

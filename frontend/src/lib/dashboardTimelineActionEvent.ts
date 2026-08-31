// A tiny, deliberately loose contract between TimelinePanel and CategoryLogger - dispatched as a
// plain DOM CustomEvent, the same mechanism dashboardQuickAddEvent.ts already uses for QuickAddFab
// -> CategoryLogger (see that module's own comment on why: neither side needs to know the other
// exists, which a lifted-state or context approach wouldn't give for free).
//
// Kept separate from dashboardQuickAddEvent rather than folding into it, even though both end up
// opening the same modal: that event carries no payload at all (it only ever means "open the full,
// unlocked picker"), while a Timeline row click needs to say *which* category to log, or *which*
// log to edit - two more specific, mutually exclusive requests dashboardQuickAddEvent was never
// shaped to carry. See timelineRowAction in lib/timeline.ts for how a row decides which of these
// (if either) it dispatches.
export type TimelineAction =
  // categoryId null means a GENERAL row - opens the same full, unlocked picker as Quick Add,
  // just triggered from a different jumping-off point. Non-null locks the form to that one
  // category, matching CategoryLogCard's own former single-category mode.
  { type: "add"; categoryId: string | null } | { type: "edit"; logId: string };

export const DASHBOARD_TIMELINE_ACTION_EVENT = "welltrack:dashboard-timeline-action";

export function dispatchTimelineAction(action: TimelineAction): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_TIMELINE_ACTION_EVENT, { detail: action }));
}

// Calls `onAction` with the action's own detail whenever one fires, for as long as the calling
// component stays mounted. Returns the cleanup function a useEffect expects.
export function listenForTimelineAction(onAction: (action: TimelineAction) => void): () => void {
  function handler(event: Event) {
    onAction((event as CustomEvent<TimelineAction>).detail);
  }
  window.addEventListener(DASHBOARD_TIMELINE_ACTION_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_TIMELINE_ACTION_EVENT, handler);
}

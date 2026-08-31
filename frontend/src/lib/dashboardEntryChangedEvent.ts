// A tiny, deliberately loose contract dispatched as a plain DOM CustomEvent rather than lifted
// React state or a context provider, matching this app's existing "no shared store between
// sections" decision (see dashboardQuickAddEvent.ts, which uses the same mechanism for the
// opposite direction). CategoryLogger and TimelinePanel's own range-chip probe both dispatch/listen
// for this now (CategoryLogger used to be CategorySection, and CategoryLogCard also dispatched it
// before the per-category card list retired - see docs/log/50-timeline-v2.md); DashboardSummary
// listens too. None of them needs to know the others exist - any one could be removed without a
// code change to the rest, which a lifted-state or context approach wouldn't give for free.
//
// Used to carry a `type` ("medication" vs. "category") back when Medication was still its own
// fixed Dashboard section - now that it's unified into Category too (Phase 19, see
// docs/log/19-medication-to-category.md), every dispatch means the same thing, so this simplified
// to a plain, argument-free "something changed, refetch" signal (no listener has ever filtered by
// type - a save anywhere can change what any of these care about).
export const DASHBOARD_ENTRY_CHANGED_EVENT = "welltrack:dashboard-entry-changed";

// Fired after a create/edit/delete network call actually succeeds - not on open, cancel, or a
// failed/rolled-back delete, since those never changed anything DashboardSummary's numbers
// depend on.
export function dispatchDashboardEntryChanged(): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_ENTRY_CHANGED_EVENT));
}

// Calls `onChange` whenever an entry-changed event fires, for as long as the calling component
// stays mounted. Returns the cleanup function a useEffect expects.
export function listenForDashboardEntryChanged(onChange: () => void): () => void {
  function handler() {
    onChange();
  }
  window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
}

// A tiny, deliberately loose contract between CategoryLogCard/CategorySection and
// DashboardSummary - dispatched as a plain DOM CustomEvent rather than lifted React state or a
// context provider, matching this app's existing "no shared store between sections" decision (see
// dashboardQuickAddEvent.ts, which uses the same mechanism for the opposite direction: QuickAddFab
// -> CategorySection). DashboardSummary doesn't need to know those components exist, and they
// don't need to know DashboardSummary exists - either side could be removed without the other
// needing a code change, which a lifted-state or context approach wouldn't give for free.
//
// Used to carry a `type` ("medication" vs. "category") back when Medication was still its own
// fixed Dashboard section - now that it's unified into Category too (Phase 19, see
// docs/log/19-medication-to-category.md), every dispatch means the same thing, so this simplified
// to a plain, argument-free "something changed, refetch" signal (the listener never filtered by
// type anyway - DashboardSummary's numbers could change from any section's activity).
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

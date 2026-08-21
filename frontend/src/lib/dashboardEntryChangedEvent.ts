// A tiny, deliberately loose contract between the four Dashboard sections (MoodSection,
// SymptomSection, MedicationSection, HabitSection) and DashboardSummary - dispatched as a plain
// DOM CustomEvent rather than lifted React state or a context provider, matching this app's
// existing "no shared store between sections" decision (see dashboardQuickAddEvent.ts, which
// uses the same mechanism for the opposite direction: QuickAddFab -> section). DashboardSummary
// doesn't need to know these four sections exist, and a section doesn't need to know
// DashboardSummary exists - either side could be removed without the other needing a code
// change, which a lifted-state or context approach wouldn't give for free.
export const DASHBOARD_ENTRY_CHANGED_EVENT = "welltrack:dashboard-entry-changed";

export type DashboardEntryChangedType = "mood" | "symptom" | "medication" | "habit";

// Fired after a section's own create/edit/delete network call actually succeeds - not on open,
// cancel, or a failed/rolled-back delete, since those never changed anything DashboardSummary's
// numbers depend on.
export function dispatchDashboardEntryChanged(type: DashboardEntryChangedType): void {
  window.dispatchEvent(
    new CustomEvent<DashboardEntryChangedType>(DASHBOARD_ENTRY_CHANGED_EVENT, { detail: type }),
  );
}

// Calls `onChange` whenever any section dispatches an entry-changed event, for as long as the
// calling component stays mounted. Returns the cleanup function a useEffect expects. Unlike
// listenForDashboardQuickAdd, this doesn't filter by `detail` type - DashboardSummary's own
// numbers (mood/symptom/medication/habit counts, streak, recent entries) can each change from
// any one of the four types changing, so every section's event is relevant here, not just one.
export function listenForDashboardEntryChanged(onChange: () => void): () => void {
  function handler() {
    onChange();
  }
  window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
}

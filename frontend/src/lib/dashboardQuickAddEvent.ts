// A tiny, deliberately loose contract between QuickAddFab and CategorySection - dispatched as a
// plain DOM CustomEvent rather than lifted React state or a context provider, matching this app's
// existing "no shared store between sections" decision (see the implementation log entry on the
// original Dashboard decomposition). QuickAddFab doesn't need to know CategorySection exists, and
// CategorySection doesn't need to know QuickAddFab exists - either side could be removed without
// the other needing a code change, which a lifted-state or context approach wouldn't give for
// free.
//
// Used to carry a `type` ("medication" vs. "category") back when Medication was still its own
// fixed Dashboard section - now that it's unified into Category too (Phase 19, see
// docs/log/19-medication-to-category.md), CategorySection is the only possible destination, so
// this simplified to a plain, argument-free "open the add-a-category flow" signal.
export const DASHBOARD_QUICK_ADD_EVENT = "welltrack:dashboard-quick-add";

export function dispatchDashboardQuickAdd(): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_QUICK_ADD_EVENT));
}

// Calls `onOpen` whenever a quick-add event fires, for as long as the calling component stays
// mounted. Returns the cleanup function a useEffect expects.
export function listenForDashboardQuickAdd(onOpen: () => void): () => void {
  window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, onOpen);
  return () => window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, onOpen);
}

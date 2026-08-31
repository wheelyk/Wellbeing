// A tiny, deliberately loose contract dispatched as a plain DOM CustomEvent rather than lifted
// React state or a context provider, matching this app's existing "no shared store between
// sections" decision (see the implementation log entry on the original Dashboard decomposition).
// Two callers dispatch it (QuickAddFab's "+" and DashboardSummary's own "Log an entry for today"
// button), and CategoryLogger listens for it - none of the three needs to know the others exist,
// so any one could be removed without a code change to the rest, which a lifted-state or context
// approach wouldn't give for free. CategoryLogger used to be CategorySection, which also rendered
// a visible panel and every per-category card - see docs/log/50-timeline-v2.md for why those are
// gone; this event's own contract is unchanged by that.
//
// Used to carry a `type` ("medication" vs. "category") back when Medication was still its own
// fixed Dashboard section - now that it's unified into Category too (Phase 19, see
// docs/log/19-medication-to-category.md), "the add-a-category flow" is the only possible
// destination, so this simplified to a plain, argument-free "open it, unlocked" signal.
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

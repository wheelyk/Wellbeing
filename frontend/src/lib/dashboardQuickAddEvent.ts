// A tiny, deliberately loose contract between QuickAddFab and the four Dashboard sections -
// dispatched as a plain DOM CustomEvent rather than lifted React state or a context provider,
// matching this app's existing "no shared store between sections" decision (see the
// implementation log entry on the original Dashboard decomposition). QuickAddFab doesn't need
// to know these sections exist, and a section doesn't need to know QuickAddFab exists - either
// side could be removed without the other needing a code change, which a lifted-state or
// context approach wouldn't give for free.
export const DASHBOARD_QUICK_ADD_EVENT = "welltrack:dashboard-quick-add";

// "category" is the one type not backed by its own fixed Dashboard section file - it's handled
// by the single, data-driven CategorySection instead (see its own comment for why), covering
// every custom category rather than one type per file the way the other four are.
export type DashboardQuickAddType = "mood" | "symptom" | "medication" | "habit" | "category";

export function dispatchDashboardQuickAdd(type: DashboardQuickAddType): void {
  window.dispatchEvent(
    new CustomEvent<DashboardQuickAddType>(DASHBOARD_QUICK_ADD_EVENT, { detail: type }),
  );
}

// Calls `onOpen` whenever a quick-add event for the matching `type` fires, for as long as the
// calling component stays mounted. Returns the cleanup function a useEffect expects.
export function listenForDashboardQuickAdd(
  type: DashboardQuickAddType,
  onOpen: () => void,
): () => void {
  function handler(event: Event) {
    if ((event as CustomEvent<DashboardQuickAddType>).detail === type) {
      onOpen();
    }
  }
  window.addEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_QUICK_ADD_EVENT, handler);
}

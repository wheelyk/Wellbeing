import { dispatchDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";

// A "+" that opens the Dashboard's "Log a category" dialog directly, regardless of scroll
// position or that section's own collapsed state - it dispatches the same `dashboardQuickAddEvent`
// CategorySection already listens for (see the implementation log entry on the dialog-based Quick
// Add redesign for the fuller history: this used to scroll to the section and rely on its own
// now-visible "+" instead, back when "+" expanded a form inline rather than opening a dialog).
//
// This used to open a small dropdown menu (Medication vs. "More…", for every custom category) -
// once Medication itself unified into Category (Phase 19, see
// docs/log/19-medication-to-category.md), "category" became the only possible destination, so the
// intermediate menu was pure friction for a single-item choice; tapping "+" now dispatches it
// directly instead.
//
// Rendered as BottomNav's raised center item (see BottomNav's `centerAction` prop and
// DashboardPage, the only page that passes one in) rather than as its own independently
// `fixed`-positioned floating circle, which is what this used to be. A FAB free-floating over a
// scrolling list of full-width cards will always end up on top of *something* eventually -
// previously that was each section's own "+ Add" button (see SectionPanel), which read as two
// identical buttons glitching on top of each other; moving it to the opposite screen edge only
// relocated the same problem onto section title text instead. Docking it into the bottom nav's
// own fixed chrome removes the entire class of bug rather than continuing to chase where it
// collides next - that chrome never overlaps scrolling content, the same way Home/History/
// Trends/Settings never do. This is deliberately mobile-only now (BottomNav itself is
// `md:hidden`): desktop's two-column grid was never the site of this problem, and each section's
// own always-visible "+ Add" button is already reachable there without a floating extra.
export function QuickAddFab() {
  return (
    <button
      type="button"
      onClick={() => dispatchDashboardQuickAdd()}
      aria-label="Quick add"
      className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        className="h-6 w-6"
      >
        <path d="M10 4v12M4 10h12" />
      </svg>
    </button>
  );
}

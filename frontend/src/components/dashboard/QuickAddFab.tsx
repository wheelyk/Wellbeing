import { useState } from "react";
import { Modal } from "../Modal";
import { dispatchDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchTaskAction } from "../../lib/dashboardTaskActionEvent";

// A "+" that opens a small choice of what to add - regardless of scroll position or any section's
// own collapsed state.
//
// This used to open a small dropdown menu (Medication vs. "More…", for every custom category)
// until Medication unified into Category (Phase 19, see docs/log/19-medication-to-category.md)
// left only one real destination, at which point tapping "+" started dispatching
// `dashboardQuickAddEvent` directly - a menu in front of one choice was pure friction. It's back
// now that one-off Tasks exist alongside Category entries (see docs/log/51-one-off-tasks.md): two
// genuinely different things to add is exactly the case a menu earns its place for, not a
// contradiction of the earlier removal's own reasoning. Built from this app's own Modal rather
// than a new anchored-popover component - a menu this small has appeared exactly twice in this
// app's history (this, and the one Phase 19 retired), never enough to justify its own primitive
// yet; Modal already gives it the focus trap, Escape, and backdrop dismissal a hand-rolled popover
// would have to reimplement.
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
// `md:hidden`): desktop's two-column grid was never the site of this problem, and
// DashboardSummary's own "Log an entry for today" button plus Timeline's own "+" for a task are
// already reachable there without a floating extra.
export function QuickAddFab() {
  const [menuOpen, setMenuOpen] = useState(false);

  function chooseCategoryEntry() {
    setMenuOpen(false);
    dispatchDashboardQuickAdd();
  }

  function chooseTask() {
    setMenuOpen(false);
    dispatchTaskAction({ type: "add" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
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

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Quick add">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={chooseCategoryEntry}
            className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-lg"
            >
              🧠
            </span>
            <span>
              <span className="block font-semibold text-text">Log a category entry</span>
              <span className="block text-xs text-text-muted">
                Track something recurring — mood, a dose, a symptom
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={chooseTask}
            className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-lg"
            >
              ✅
            </span>
            <span>
              <span className="block font-semibold text-text">Add a task</span>
              <span className="block text-xs text-text-muted">
                A one-off thing to do, with a date and time
              </span>
            </span>
          </button>
        </div>
      </Modal>
    </>
  );
}

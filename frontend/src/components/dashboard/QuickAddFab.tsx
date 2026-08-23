import { useEffect, useRef, useState } from "react";
import {
  dispatchDashboardQuickAdd,
  type DashboardQuickAddType,
} from "../../lib/dashboardQuickAddEvent";

// The first four match ENTRY_TYPE_ICON in DashboardSummary.tsx - same types, same icons, so a
// user recognizes "🙂 Mood" here as the same thing they've already seen in the unified Recent
// entries list above. Hardcoded, not derived from a shared constant, for the same reason the
// four Section components are each their own file rather than one generic loop over a config
// array - see this project's established "adding a log type means adding a file" convention.
// "category" is the one deliberate exception - it doesn't get its own array entry per category
// (an unbounded, user/admin-created list can't live in this hardcoded array without breaking
// that same convention); instead one "More…" entry dispatches the single "category" quick-add
// type, which CategorySection's own data-driven picker handles - see its own comment.
const QUICK_ADD_ITEMS: Array<{ key: DashboardQuickAddType; label: string; icon: string }> = [
  { key: "mood", label: "Mood", icon: "🙂" },
  { key: "symptom", label: "Symptom", icon: "🩺" },
  { key: "medication", label: "Medication", icon: "💊" },
  { key: "habit", label: "Habit", icon: "✅" },
  { key: "category", label: "More…", icon: "➕" },
];

// A "+" that opens any of the four Dashboard sections' add dialog directly, regardless of scroll
// position or a section's own collapsed state - it dispatches the same `dashboardQuickAddEvent`
// each section already listens for (see the implementation log entry on the dialog-based Quick
// Add redesign for the fuller history: this used to scroll to the section and rely on its own
// now-visible "+" instead, back when "+" expanded a form inline rather than opening a dialog).
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openSectionDialog(type: DashboardQuickAddType) {
    setOpen(false);
    dispatchDashboardQuickAdd(type);
  }

  return (
    // `relative`, not `fixed` - this now renders inline as BottomNav's own raised center item,
    // so its positioning context is that flex column, not the viewport. `-mt-7` is what actually
    // raises the button: it pulls the 56px (h-14) circle up out of the bar's own 64px (h-16) row
    // so roughly half of it pokes above the bar's top border, the classic "docked FAB" look.
    <div ref={containerRef} className="relative flex flex-col items-center">
      {open && (
        <div
          role="menu"
          aria-label="Jump to a section"
          className="absolute bottom-full left-1/2 mb-2 flex min-w-40 -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {QUICK_ADD_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => openSectionDialog(item.key)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
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
    </div>
  );
}

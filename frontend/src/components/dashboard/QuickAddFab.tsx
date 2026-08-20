import { useEffect, useRef, useState } from "react";
import {
  dispatchDashboardQuickAdd,
  type DashboardQuickAddType,
} from "../../lib/dashboardQuickAddEvent";

// Matches ENTRY_TYPE_ICON in DashboardSummary.tsx - same four types, same icons, so a user
// recognizes "🙂 Mood" here as the same thing they've already seen in the unified Recent
// entries list above. Hardcoded, not derived from a shared constant, for the same reason the
// four Section components are each their own file rather than one generic loop over a config
// array - see this project's established "adding a log type means adding a file" convention.
const QUICK_ADD_ITEMS: Array<{ key: DashboardQuickAddType; label: string; icon: string }> = [
  { key: "mood", label: "Mood", icon: "🙂" },
  { key: "symptom", label: "Symptom", icon: "🩺" },
  { key: "medication", label: "Medication", icon: "💊" },
  { key: "habit", label: "Habit", icon: "✅" },
];

// A viewport-fixed "+" that opens any of the four Dashboard sections' add dialog directly - it
// used to scroll to the section instead and rely on that section's own now-visible "+" (each
// section owns its form state independently, no shared store between them, by design - see the
// original Dashboard decomposition entry), back when "+" expanded a form inline rather than
// opening a dialog. Once the form moved into a real `Modal` (see the implementation log entry
// on that redesign), a dialog can be opened from anywhere regardless of scroll position or a
// section's own collapsed state, so scrolling first stopped being necessary - this now just
// dispatches the same `dashboardQuickAddEvent` each section already listens for.
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
    // bottom-24 on mobile clears BottomNav (a fixed h-16/64px bar sitting at the very bottom of
    // the viewport below `md:` - see BottomNav.tsx) with room to spare; md:bottom-6 reverts to
    // the original tighter offset once `md:` hides BottomNav and the FAB has the full viewport
    // height to itself again. Found and confirmed via a real 375px-viewport screenshot on the
    // Dashboard page - see the implementation log entry for this bottom-nav task.
    // left-6, not right-6 - each Dashboard section's own "+ Add" button (see SectionPanel) sits
    // at the right edge of its header row, the same column real screen width puts this fixed FAB
    // in too. Whichever section happened to be scrolled into the FAB's fixed vertical band ended
    // up with two blue circular "+" buttons visually stacked on top of each other - confusing,
    // and easy to mistake for a rendering bug. Nothing sits in the same column on the left.
    <div ref={containerRef} className="fixed bottom-24 left-6 z-20 md:bottom-6">
      {open && (
        <div
          role="menu"
          aria-label="Jump to a section"
          className="absolute bottom-16 left-0 flex min-w-40 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
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
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

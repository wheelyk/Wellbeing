import type { ReactNode } from "react";
import { useCollapsedState } from "../../hooks/useCollapsedState";

interface SectionPanelProps {
  title: string;
  // Suffixed onto a shared localStorage key prefix (see useCollapsedState) - must be unique per
  // section (e.g. "dashboard.mood") so each of the four Dashboard sections remembers its own
  // collapsed state independently.
  storageKey: string;
  // Rendered above the collapsible list, and never itself collapsed - this is where each
  // section's "+ Add" button/form lives, so it stays reachable regardless of the list's state.
  topContent: ReactNode;
  children: ReactNode;
}

// Wraps each Dashboard section's "+ Add" area and "Recent X entries" list in one bordered card,
// with just the list portion collapsible - see the implementation log entry on the Dashboard
// panel redesign for why the add area and the list are deliberately two separate regions rather
// than one collapsible whole.
export function SectionPanel({ title, storageKey, topContent, children }: SectionPanelProps) {
  const [collapsed, toggleCollapsed] = useCollapsedState(`dashboard.${storageKey}`);
  const contentId = `section-panel-${storageKey}-content`;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface shadow-sm">
      <div className="p-6">{topContent}</div>
      <div className="border-t border-border p-6">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${collapsed ? "" : "rotate-180"}`}
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {!collapsed && (
          <div id={contentId} className="mt-3">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

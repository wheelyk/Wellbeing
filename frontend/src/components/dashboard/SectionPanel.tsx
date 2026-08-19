import type { ReactNode } from "react";
import { useCollapsedState } from "../../hooks/useCollapsedState";

interface SectionPanelProps {
  title: string;
  // Suffixed onto a shared localStorage key prefix (see useCollapsedState) - must be unique per
  // section (e.g. "mood") so each of the four Dashboard sections remembers its own collapsed
  // state independently, and doubles as this panel's scroll-target id (see QuickAddFab, which
  // jumps to `#dashboard-section-${storageKey}`).
  storageKey: string;
  addLabel: string;
  onAddClick: () => void;
  // Everything below the header row: the add/edit form (when open) and the entries list,
  // together - both live inside the same collapsible region, since opening the form is only
  // useful if the panel is also expanded to show it (see the onAddClick handler below, which
  // expands the panel before calling this).
  children: ReactNode;
}

// One bordered card per Dashboard section, with the "+ Add" action inlined into the same header
// row as the title and collapse chevron - see the implementation log entry on this redesign for
// why an earlier version kept the add button in its own separate area above the list instead.
export function SectionPanel({
  title,
  storageKey,
  addLabel,
  onAddClick,
  children,
}: SectionPanelProps) {
  const { collapsed, toggle, expand } = useCollapsedState(`dashboard.${storageKey}`);
  const contentId = `section-panel-${storageKey}-content`;

  function handleAddClick() {
    expand();
    onAddClick();
  }

  return (
    <section
      id={`dashboard-section-${storageKey}`}
      className="mt-8 rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <h2 className="flex-1 text-lg font-semibold text-text">{title}</h2>
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
        {/* min 44px touch target (WCAG 2.5.5) despite the compact 20px icon - h-11 w-11 gives
            exactly that, unlike the icon-only button in the original comparison mockup, which
            was sized for a small phone-frame graphic, not a real thumb. */}
        <button
          type="button"
          onClick={handleAddClick}
          aria-label={addLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <path d="M10 4v12M4 10h12" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div id={contentId} className="border-t border-border p-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

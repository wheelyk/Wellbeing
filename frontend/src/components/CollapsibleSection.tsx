import type { ReactNode } from "react";
import { useCollapsedState } from "../hooks/useCollapsedState";

interface CollapsibleSectionProps {
  title: ReactNode;
  // Passed straight through to useCollapsedState - must be unique per section so each one
  // remembers its own collapsed state independently (see DashboardSummary's "Recent entries"
  // toggle and SectionPanel's four Quick Add sections for the same convention this follows).
  storageKey: string;
  children: ReactNode;
}

// The same chevron-toggle disclosure header used by SectionPanel (the four Dashboard Quick Add
// sections) and DashboardSummary's own "Recent entries" toggle, pulled out here as a shared
// building block now that Trends needs the identical pattern three more times for its own
// sections - unlike SectionPanel, this one has no "+ Add" action of its own, just a title and
// its content. Renders only the header + collapsible content, not an outer bordered card - the
// caller still owns that (each Trends section already had its own `rounded-2xl border ...`
// wrapper before this existed, and reusing it here means one less thing this component has to
// know about spacing/layout for).
export function CollapsibleSection({ title, storageKey, children }: CollapsibleSectionProps) {
  const { collapsed, toggle } = useCollapsedState(storageKey);
  const contentId = `collapsible-section-${storageKey}-content`;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
      {!collapsed && (
        <div id={contentId} className="mt-1">
          {children}
        </div>
      )}
    </>
  );
}

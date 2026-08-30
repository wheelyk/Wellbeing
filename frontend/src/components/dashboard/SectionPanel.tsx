import type { ReactNode } from "react";
import { CollapsibleSection } from "../CollapsibleSection";

interface SectionPanelProps {
  title: string;
  // Suffixed onto a shared localStorage key prefix (see useCollapsedState) - must be unique per
  // section (e.g. "medication") so each Dashboard section remembers its own collapsed state
  // independently, and doubles as this panel's scroll-target id (see QuickAddFab, which jumps to
  // `#dashboard-section-${storageKey}`).
  storageKey: string;
  addLabel: string;
  onAddClick: () => void;
  // The entries list only - the add/edit form no longer lives in here at all (see the
  // implementation log entry on the dialog-based Quick Add redesign for why: an earlier version
  // rendered the form inline in this same collapsible region, which meant clicking "+" forced
  // the whole list open too, whether or not anyone wanted to see it). The form now renders in a
  // `Modal`, owned by each Section component directly - collapsing this panel has no effect on
  // it, and opening the form has no effect on this panel's own collapsed state either.
  children: ReactNode;

  // ---- What a collapsed panel says about itself --------------------------------------------
  // Passed straight through to CollapsibleSection. "Recent Anxiety ⌄" tells a reader nothing;
  // "🧠 Anxiety / Last 4/7 · yesterday, 21:12" tells them whether it is worth opening.
  icon?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  defaultCollapsed?: boolean;
}

// One bordered card per Dashboard section, with the "+ Add" action inlined into the same header
// row as the title and collapse chevron - see the implementation log entry on this redesign for
// why an earlier version kept the add button in its own separate area above the list instead.
//
// The header itself is no longer written out here. It used to be a near-copy of
// CollapsibleSection's, differing only in having an action beside the toggle - something that
// component could not express until it was given an `actions` slot. This is now that component,
// plus a card and a "+". See docs/log/43-disclosure-panel.md.
export function SectionPanel({
  title,
  storageKey,
  addLabel,
  onAddClick,
  children,
  icon,
  subtitle,
  badge,
  meta,
  defaultCollapsed,
}: SectionPanelProps) {
  return (
    // No margin/spacing classes here - this panel is always laid out inside DashboardPage's own
    // grid (a single column on mobile, two from md: up - see the implementation log entry on
    // this app's mobile-first responsive pass), which controls spacing between panels via `gap`
    // instead. A per-panel margin would double up with the grid's gap unpredictably depending on
    // column position.
    <section
      id={`dashboard-section-${storageKey}`}
      className="rounded-2xl border border-border bg-surface shadow-sm"
    >
      <CollapsibleSection
        title={title}
        storageKey={`dashboard.${storageKey}`}
        defaultCollapsed={defaultCollapsed}
        icon={icon}
        subtitle={subtitle}
        badge={badge}
        meta={meta}
        headerClassName="p-4"
        contentClassName="border-t border-border p-4 pt-3"
        actions={
          // min 44px touch target (WCAG 2.5.5) despite the compact 20px icon - h-11 w-11 gives
          // exactly that, unlike the icon-only button in the original comparison mockup, which
          // was sized for a small phone-frame graphic, not a real thumb.
          <button
            type="button"
            onClick={onAddClick}
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
        }
      >
        {children}
      </CollapsibleSection>
    </section>
  );
}

import type { ReactNode } from "react";
import { useCollapsedState } from "../hooks/useCollapsedState";

interface CollapsibleSectionProps {
  title: ReactNode;
  // Passed straight through to useCollapsedState - must be unique per section so each one
  // remembers its own collapsed state independently (see DashboardSummary's "Recent entries"
  // toggle and SectionPanel's four Quick Add sections for the same convention this follows).
  storageKey: string;
  children: ReactNode;
  // Every existing section wants "expanded until the user says otherwise," which is
  // useCollapsedState's own default - left unset here for every one of them. A section whose
  // content is both expensive to fetch and rarely needed (e.g. Settings' "Deleted categories")
  // can opt into the opposite default instead, so its own fetch only actually happens once the
  // caller opens it, not on every page load.
  defaultCollapsed?: boolean;

  // ---- The parts that make a *collapsed* section worth reading -----------------------------
  //
  // A closed panel should still answer a question. "Recent Anxiety ⌄" answers none; "Medicine ·
  // Built-in · 2" answers three. Every one of these slots existed already - but only inside the
  // Categories page's own hand-written group header. See `actions` below for why that header was
  // hand-written, and docs/log/43-disclosure-panel.md for the whole story.

  /** Leading glyph, before the title. */
  icon?: ReactNode;
  /** A second line under the title: what this section holds, without opening it. */
  subtitle?: ReactNode;
  /** A status pill - "Built-in", "Hidden". State as form rather than as prose. */
  badge?: ReactNode;
  /** A count or short summary, sitting just before the chevron. */
  meta?: ReactNode;

  /**
   * Controls rendered *beside* the toggle, never inside it.
   *
   * This is the entire reason the Categories group header could not use this component and was
   * written out by hand instead: the header used to be one <button>, so a Hide or Rename control
   * had nowhere to go. Nesting a button inside a button is invalid HTML, and tapping it would have
   * toggled the section too. The header is now a flex row whose first child is the toggle, so
   * actions are siblings of it and independent of it.
   */
  actions?: ReactNode;

  /**
   * "lg" is a page-level section heading (Dashboard, Trends). "md" suits a header nested inside a
   * page that already has one - a category group sitting under the Categories heading.
   */
  size?: "lg" | "md";

  /**
   * Whether the title is a real <h2>. True for page-level sections, which is every existing
   * caller. The Categories group headers are deliberately not headings - a page renders a dozen of
   * them, and turning each into an <h2> would bury the page's own heading structure in noise.
   */
  heading?: boolean;

  /**
   * Spacing for the header row and the content, so a caller that owns a card can put the padding
   * where its own design needs it. SectionPanel pads inside the card and rules off the content;
   * the bare callers want neither. Without these, one of the two would have had to keep its own
   * copy of this component purely over padding.
   */
  headerClassName?: string;
  contentClassName?: string;
}

// The chevron every disclosure in this app shares. Its direction reflects the actual state rather
// than what was last clicked (see docs/log/36-picker-and-collapse-polish.md for when that was not
// true of the bulk control). Exported once History's own per-day divider (docs/log/53-history-redesign.md)
// needed the identical glyph for a header shaped too differently from this component's own to
// reuse the whole thing - the same "extract once a second consumer needs it" call StatusPill's
// own comment already made.
export function Chevron({ collapsed, size }: { collapsed: boolean; size: "lg" | "md" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${size === "lg" ? "h-5 w-5" : "h-4 w-4"} shrink-0 text-text-muted transition-transform ${
        collapsed ? "" : "rotate-180"
      }`}
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

// The one disclosure header in this app.
//
// There used to be three: this one (title only), SectionPanel's (title plus a fixed "+" action),
// and the Categories page's own (icon, pill, count, and an independent Hide action). The third was
// much the best, and that was not a coincidence - it was hand-written precisely *because* this
// component could not hold an action beside its toggle, and once a header is being written by hand,
// giving it a count and a pill costs nothing. The other two are now built on this one.
//
// Renders the header and the collapsible content, not an outer card - the caller still owns that,
// since each already had its own wrapper with its own spacing.
export function CollapsibleSection({
  title,
  storageKey,
  children,
  defaultCollapsed = false,
  icon,
  subtitle,
  badge,
  meta,
  actions,
  size = "lg",
  heading = true,
  headerClassName = "",
  contentClassName = "mt-1",
}: CollapsibleSectionProps) {
  const { collapsed, toggle } = useCollapsedState(storageKey, defaultCollapsed);
  const contentId = `collapsible-section-${storageKey}-content`;

  const titleClass = `block truncate ${size === "lg" ? "text-lg font-semibold" : "font-medium"} text-text`;

  return (
    <>
      <div className={`flex items-center gap-2 ${headerClassName}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {icon !== undefined && (
            <span aria-hidden="true" className="shrink-0">
              {icon}
            </span>
          )}
          {/* min-w-0 so a long name truncates instead of shoving the count and chevron off the row
              on a narrow screen - the whole point of a count is that it stays visible. */}
          <span className="flex min-w-0 flex-1 flex-col">
            {/* The badge sits immediately after the name, not out on the right beside the count.
                The category rows inside a group put their own "Built-in" pill there too, and a
                group header that disagreed with the rows under it read as two different designs -
                caught by comparing screenshots before and after this refactor, not by any test. */}
            <span className="flex min-w-0 items-center gap-2">
              {heading ? (
                <h2 className={titleClass}>{title}</h2>
              ) : (
                <span className={titleClass}>{title}</span>
              )}
              {badge !== undefined && <span className="shrink-0">{badge}</span>}
            </span>
            {subtitle !== undefined && (
              <span className="block truncate text-xs font-normal text-text-muted">{subtitle}</span>
            )}
          </span>
          {meta !== undefined && (
            <span className="shrink-0 text-xs tabular-nums text-text-muted">{meta}</span>
          )}
          <Chevron collapsed={collapsed} size={size} />
        </button>
        {actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {!collapsed && (
        <div id={contentId} className={contentClassName}>
          {children}
        </div>
      )}
    </>
  );
}

// The pill used for "Built-in" and "Hidden", and anything else that is a *state* rather than a
// name. Extracted because the Categories page had written the same span out three times, and the
// Dashboard is about to want one for a cooldown.
export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-text-muted">
      {children}
    </span>
  );
}

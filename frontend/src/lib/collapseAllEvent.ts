// Lets one control collapse or expand every section sharing a storage-key prefix, without any of
// them knowing that control exists. Dispatched as a plain DOM CustomEvent rather than lifted state
// or a context provider, matching the convention dashboardQuickAddEvent.ts already established
// here and for the same reason: each collapsible section keeps owning its own state (including its
// own persistence), and either side could be removed without the other needing a code change.
//
// The alternative - lifting every group's collapsed state up into the page - would have meant the
// page owning persistence for all of them, and would have coupled a page to the internals of a
// hook that several unrelated screens also use. See docs/log/31-categories-page-polish.md.

export const COLLAPSE_ALL_EVENT = "welltrack:collapse-all";

interface CollapseAllDetail {
  // Every section whose storage key starts with this responds; everything else ignores it. A
  // prefix rather than an exact key is what makes "all the category groups" addressable as a set
  // (they're stored as "categories.group.<id>").
  prefix: string;
  collapsed: boolean;
}

export function dispatchCollapseAll(prefix: string, collapsed: boolean): void {
  window.dispatchEvent(
    new CustomEvent<CollapseAllDetail>(COLLAPSE_ALL_EVENT, { detail: { prefix, collapsed } }),
  );
}

// Calls `onChange` whenever a collapse-all event fires for a prefix this key falls under, for as
// long as the calling component stays mounted. Returns the cleanup function a useEffect expects.
export function listenForCollapseAll(
  key: string,
  onChange: (collapsed: boolean) => void,
): () => void {
  const handler = (event: Event) => {
    const { prefix, collapsed } = (event as CustomEvent<CollapseAllDetail>).detail;
    if (key.startsWith(prefix)) onChange(collapsed);
  };
  window.addEventListener(COLLAPSE_ALL_EVENT, handler);
  return () => window.removeEventListener(COLLAPSE_ALL_EVENT, handler);
}

// The reverse direction: a section announcing that its own collapsed state changed, so a control
// like "Collapse all" can label itself for what will actually happen rather than for whatever it
// did last time. Without this the button went stale the moment a single group was toggled by hand -
// which is exactly how it was reported.
//
// Still a broadcast rather than lifted state: sections announce into the room without knowing
// anyone is listening, and the page listens without knowing which sections exist.
export const COLLAPSED_CHANGED_EVENT = "welltrack:collapsed-changed";

interface CollapsedChangedDetail {
  key: string;
  collapsed: boolean;
}

export function dispatchCollapsedChanged(key: string, collapsed: boolean): void {
  window.dispatchEvent(
    new CustomEvent<CollapsedChangedDetail>(COLLAPSED_CHANGED_EVENT, {
      detail: { key, collapsed },
    }),
  );
}

export function listenForCollapsedChanged(
  onChange: (key: string, collapsed: boolean) => void,
): () => void {
  const handler = (event: Event) => {
    const { key, collapsed } = (event as CustomEvent<CollapsedChangedDetail>).detail;
    onChange(key, collapsed);
  };
  window.addEventListener(COLLAPSED_CHANGED_EVENT, handler);
  return () => window.removeEventListener(COLLAPSED_CHANGED_EVENT, handler);
}

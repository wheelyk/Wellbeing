import { useEffect, useState } from "react";
import { dispatchCollapsedChanged, listenForCollapseAll } from "../lib/collapseAllEvent";

// The one deliberate use of localStorage in this app - everywhere else (see api/client.ts,
// auth/AuthContext.tsx) persistence is avoided on purpose for anything auth-related, since
// nothing a page's own JavaScript can read is safe from XSS. A collapsed/expanded UI preference
// carries none of that risk, so persisting it is a plain usability win with no security
// downside, not an exception to that rule.
const STORAGE_PREFIX = "welltrack:collapsed:";

function readStored(key: string, defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
    return stored === null ? defaultValue : stored === "true";
  } catch {
    // Private browsing / storage disabled - falls back to the in-memory default for this
    // session; the toggle itself still works, it just won't survive a reload.
    return defaultValue;
  }
}

interface CollapsedStateControls {
  collapsed: boolean;
  toggle: () => void;
  // Forces expanded, regardless of the current or stored value - used when some other action
  // (e.g. clicking a section's own "+ Add" button) needs its content visible, not just toggled.
  expand: () => void;
}

function persist(key: string, value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // Same fallback as readStored above - state still updates in-memory even if it can't persist.
  }
}

// Exported so a page can ask what a section *would* start as, without needing to know that this
// module keeps it in localStorage or under what prefix.
export function readCollapsedState(key: string, defaultValue = false): boolean {
  return readStored(key, defaultValue);
}

export function useCollapsedState(key: string, defaultValue = false): CollapsedStateControls {
  const [collapsed, setCollapsed] = useState(() => readStored(key, defaultValue));

  // Responds to a "collapse/expand everything under this prefix" broadcast (see
  // lib/collapseAllEvent.ts). The result is persisted exactly as a manual toggle would be, so a
  // bulk action isn't quietly forgotten on the next page load.
  useEffect(() => {
    return listenForCollapseAll(key, (next) => {
      setCollapsed(next);
      persist(key, next);
      dispatchCollapsedChanged(key, next);
    });
  }, [key]);

  // The persist and the announcement deliberately sit *outside* the state updater. React may run
  // an updater during render, and dispatching from there synchronously calls listeners - which
  // meant a listening parent setting state while a child was still rendering, and React said so:
  // "Cannot update a component while rendering a different component". Both side effects belong in
  // the event handler, where they run exactly once, after the click.
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persist(key, next);
    // Announced so a bulk control can stay honest about what it would do next - see
    // lib/collapseAllEvent.ts.
    dispatchCollapsedChanged(key, next);
  }

  function expand() {
    setCollapsed(false);
    persist(key, false);
    dispatchCollapsedChanged(key, false);
  }

  return { collapsed, toggle, expand };
}

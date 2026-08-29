import { useEffect, useState } from "react";
import { listenForCollapseAll } from "../lib/collapseAllEvent";

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

export function useCollapsedState(key: string, defaultValue = false): CollapsedStateControls {
  const [collapsed, setCollapsed] = useState(() => readStored(key, defaultValue));

  // Responds to a "collapse/expand everything under this prefix" broadcast (see
  // lib/collapseAllEvent.ts). The result is persisted exactly as a manual toggle would be, so a
  // bulk action isn't quietly forgotten on the next page load.
  useEffect(() => {
    return listenForCollapseAll(key, (next) => {
      setCollapsed(next);
      persist(key, next);
    });
  }, [key]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      persist(key, next);
      return next;
    });
  }

  function expand() {
    setCollapsed(false);
    persist(key, false);
  }

  return { collapsed, toggle, expand };
}

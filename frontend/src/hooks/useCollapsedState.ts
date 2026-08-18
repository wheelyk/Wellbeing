import { useState } from "react";

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

export function useCollapsedState(key: string, defaultValue = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readStored(key, defaultValue));

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, String(next));
      } catch {
        // Same fallback as above - the toggle still updates in-memory even if it can't persist.
      }
      return next;
    });
  }

  return [collapsed, toggle];
}

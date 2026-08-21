import { useState } from "react";

// Mirrors useCollapsedState.ts's own localStorage pattern (try/catch-guarded reads/writes, an
// in-memory fallback when storage is unavailable) - see that file's comment for why persisting a
// plain UI preference like this carries none of the XSS risk that keeps this app's auth state
// out of localStorage entirely.
const STORAGE_KEY = "welltrack:theme";

export type ThemePreference = "system" | "light" | "dark";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readStored(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Private browsing / storage disabled - the toggle still works for this session via
    // in-memory state, it just won't survive a reload.
    return "system";
  }
}

function persist(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Same fallback as readStored above.
  }
}

// Applies `preference` directly to the DOM - the exact same two knobs index.html's own inline
// bootstrap script (which runs before this app's bundled JS even loads, to avoid a flash of the
// wrong theme on first paint) sets from localStorage. Keeping the logic in both places in sync
// is what makes "toggled just now" and "already correct on the next full page load" agree; see
// index.css's dark-palette comment for how `[data-theme]` and `prefers-color-scheme` combine.
//
// Exported (not just used internally by the hook below) so index.html's inline script and this
// module's own logic are reviewable side by side as the two halves of one mechanism, even though
// the inline script can't literally import this - it has to run standalone, before any bundled
// JS exists to import.
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }

  // Browser-native form controls (checkboxes, date inputs, scrollbars) and Chrome for Android's
  // own auto-dark heuristic look at this meta tag independently of this app's own CSS variables -
  // swapping --color-* tokens alone doesn't reach them (see index.css's dark-palette comment,
  // and index.html's own comment, for the bug class this app was already bitten by once). "light
  // dark" tells the browser both are supported and to pick based on the OS's own
  // prefers-color-scheme; a specific value forces that scheme regardless of the OS setting,
  // matching an explicit override.
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", preference === "system" ? "light dark" : preference);
  }
}

interface ThemePreferenceControls {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

// Deliberately not app-wide reactive state (no context/provider) - the only thing that currently
// reads or writes this preference is the toggle on SettingsPage, so a plain hook that persists
// and directly mutates the DOM on change is enough. Also keeps this self-contained rather than
// needing any App.tsx wiring: see SettingsPage.tsx's comment on the toggle for why that boundary
// matters right now (a parallel workstream, in a different worktree, is about to make its own
// App.tsx change for an unrelated toast system).
export function useThemePreference(): ThemePreferenceControls {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored());

  function setPreference(next: ThemePreference): void {
    persist(next);
    applyThemePreference(next);
    setPreferenceState(next);
  }

  return { preference, setPreference };
}

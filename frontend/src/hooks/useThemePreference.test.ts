import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { applyThemePreference, useThemePreference } from "./useThemePreference";

// The test environment's own `window.localStorage` (Node's built-in, not jsdom's) is a
// non-functional stub with no working setItem/getItem/clear - unrelated to this hook's own
// code. See CollapsibleSection.test.tsx / SectionPanel.test.tsx for the same workaround this
// codebase already established for exactly this situation: a real, working Storage stood in via
// vi.stubGlobal, since useThemePreference's persistence (not just its in-memory fallback) is
// specifically what these tests need to exercise.
function stubWorkingLocalStorage(): void {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
}

function setColorSchemeMeta(content: string) {
  document.head.querySelectorAll('meta[name="color-scheme"]').forEach((el) => el.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "color-scheme");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

describe("useThemePreference", () => {
  beforeEach(() => {
    stubWorkingLocalStorage();
    document.documentElement.removeAttribute("data-theme");
    setColorSchemeMeta("light dark");
  });

  it("defaults to 'system' with nothing stored, leaving no data-theme attribute", () => {
    const { result } = renderHook(() => useThemePreference());

    expect(result.current.preference).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads a previously stored explicit preference on mount", () => {
    window.localStorage.setItem("welltrack:theme", "dark");

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.preference).toBe("dark");
  });

  it("falls back to 'system' for a garbage stored value", () => {
    window.localStorage.setItem("welltrack:theme", "solarized");

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.preference).toBe("system");
  });

  it("setPreference('dark') persists it, sets data-theme, and forces the meta color-scheme", () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.setPreference("dark"));

    expect(result.current.preference).toBe("dark");
    expect(window.localStorage.getItem("welltrack:theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "dark",
    );
  });

  it("setPreference('light') persists it, sets data-theme, and forces the meta color-scheme", () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.setPreference("light"));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light",
    );
  });

  it("setPreference('system') clears data-theme and restores the dual meta color-scheme", () => {
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current.setPreference("dark"));

    act(() => result.current.setPreference("system"));

    expect(result.current.preference).toBe("system");
    expect(window.localStorage.getItem("welltrack:theme")).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light dark",
    );
  });

  it("applyThemePreference is safe to call directly (used by index.html's own bootstrap script as a parallel, non-imported implementation)", () => {
    applyThemePreference("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    applyThemePreference("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

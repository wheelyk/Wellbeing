import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "./CollapsibleSection";

// Same non-functional-localStorage-in-this-test-environment situation SectionPanel.test.tsx
// documents and works around - stubbed here for the same reason (useCollapsedState's own
// try/catch already degrades to in-memory-only without this, so only *persistence* specifically
// needs a real stand-in).
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

describe("CollapsibleSection", () => {
  beforeEach(() => {
    stubWorkingLocalStorage();
  });

  it("renders expanded by default, with its content visible", () => {
    render(
      <CollapsibleSection title="Activity" storageKey="test-a">
        <p>The chart</p>
      </CollapsibleSection>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("The chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activity/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hides its content and flips aria-expanded when the header is clicked, and restores it on a second click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Activity" storageKey="test-b">
        <p>The chart</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /activity/i });

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The chart")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The chart")).toBeInTheDocument();
  });

  it("keeps two sections' collapsed state independent via their own storageKey", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CollapsibleSection title="First" storageKey="test-c">
          <p>First content</p>
        </CollapsibleSection>
        <CollapsibleSection title="Second" storageKey="test-d">
          <p>Second content</p>
        </CollapsibleSection>
      </>,
    );

    await user.click(screen.getByRole("button", { name: /first/i }));

    expect(screen.queryByText("First content")).not.toBeInTheDocument();
    expect(screen.getByText("Second content")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection, StatusPill } from "./CollapsibleSection";

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

  // ---- The slots that make a *closed* panel worth reading --------------------------------
  //
  // Until now these lived only in the Categories page's own hand-written group header. See
  // docs/log/43-disclosure-panel.md for why that header was hand-written, and why that is
  // exactly the reason it was the best of the three.

  it("shows the icon, badge, count and subtitle while collapsed", async () => {
    render(
      <CollapsibleSection
        title="Medicine"
        storageKey="t.parts"
        icon="💊"
        badge={<StatusPill>Built-in</StatusPill>}
        meta={2}
        subtitle="Diazepam · Sertraline"
      >
        <p>rows</p>
      </CollapsibleSection>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Medicine/ }));

    // The content is gone, but everything describing it is still on screen. That is the point.
    expect(screen.queryByText("rows")).not.toBeInTheDocument();
    expect(screen.getByText("💊")).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Diazepam · Sertraline")).toBeInTheDocument();
  });

  // The structural fix the whole change exists for. An action *inside* the toggle would be a
  // button nested in a button - invalid HTML, and tapping it would collapse the section as a side
  // effect. That constraint is precisely why the Categories header could not use this component.
  it("keeps an action out of the toggle button, so it acts independently", async () => {
    const onAction = vi.fn();
    render(
      <CollapsibleSection
        title="Symptom"
        storageKey="t.actions"
        actions={
          <button type="button" onClick={onAction}>
            Hide
          </button>
        }
      >
        <p>rows</p>
      </CollapsibleSection>,
    );
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /Symptom/ });
    const action = screen.getByRole("button", { name: "Hide" });

    // Not merely "both render" - the action must not be a descendant of the toggle.
    expect(toggle.contains(action)).toBe(false);

    await user.click(action);

    expect(onAction).toHaveBeenCalledTimes(1);
    // ...and using it did not collapse the section as a side effect.
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("rows")).toBeInTheDocument();
  });

  // A page renders a dozen category groups at once; making each one an <h2> would bury the page's
  // own heading structure in noise. Page-level sections stay real headings.
  it("is a heading by default, and can decline to be one", () => {
    const { unmount } = render(
      <CollapsibleSection title="Recent entries" storageKey="t.h1">
        <p>a</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("heading", { name: "Recent entries" })).toBeInTheDocument();
    unmount();

    render(
      <CollapsibleSection title="Uncategorized" storageKey="t.h2" heading={false}>
        <p>a</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByRole("heading", { name: "Uncategorized" })).toBeNull();
    expect(screen.getByRole("button", { name: /Uncategorized/ })).toBeInTheDocument();
  });
});

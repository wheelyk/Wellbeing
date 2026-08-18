import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionPanel } from "./SectionPanel";

// The test environment's own `window.localStorage` (Node's built-in, not jsdom's - see this
// project's own investigation into why) is a non-functional stub with no setItem/getItem/clear
// at all, unrelated to SectionPanel's own code. useCollapsedState already degrades gracefully
// around exactly this case (try/catch, falls back to in-memory-only), so the toggle behavior
// itself is still exercisable without it - but *persistence* specifically can only be tested
// with a real, working Storage standing in for it.
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

describe("SectionPanel", () => {
  beforeEach(() => {
    stubWorkingLocalStorage();
  });

  it("renders topContent and children, expanded by default", () => {
    render(
      <SectionPanel title="Recent things" storageKey="test-a" topContent={<button>+ Add</button>}>
        <p>The list</p>
      </SectionPanel>,
    );

    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
    expect(screen.getByText("The list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recent things/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hides the list but keeps the add button visible once collapsed", async () => {
    const user = userEvent.setup();
    render(
      <SectionPanel title="Recent things" storageKey="test-b" topContent={<button>+ Add</button>}>
        <p>The list</p>
      </SectionPanel>,
    );

    await user.click(screen.getByRole("button", { name: /recent things/i }));

    // The whole point of keeping the add area outside the collapsible region: it must never
    // disappear, regardless of the list's own collapsed state.
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
    expect(screen.queryByText("The list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recent things/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("persists the collapsed state across remounts under the same storageKey", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <SectionPanel title="Recent things" storageKey="test-c" topContent={<button>+ Add</button>}>
        <p>The list</p>
      </SectionPanel>,
    );
    await user.click(screen.getByRole("button", { name: /recent things/i }));
    unmount();

    render(
      <SectionPanel title="Recent things" storageKey="test-c" topContent={<button>+ Add</button>}>
        <p>The list</p>
      </SectionPanel>,
    );

    expect(screen.queryByText("The list")).not.toBeInTheDocument();
  });

  it("does not share collapsed state between different storageKeys", () => {
    window.localStorage.setItem("welltrack:collapsed:test-d", "true");

    render(
      <SectionPanel title="Recent things" storageKey="test-e" topContent={<button>+ Add</button>}>
        <p>The list</p>
      </SectionPanel>,
    );

    expect(screen.getByText("The list")).toBeInTheDocument();
  });
});

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

function renderPanel(storageKey: string, onAddClick = vi.fn()) {
  return render(
    <SectionPanel
      title="Recent things"
      storageKey={storageKey}
      addLabel="Add a thing"
      onAddClick={onAddClick}
    >
      <p>The list</p>
    </SectionPanel>,
  );
}

describe("SectionPanel", () => {
  beforeEach(() => {
    stubWorkingLocalStorage();
  });

  it("renders the add button and children, expanded by default", () => {
    renderPanel("test-a");

    expect(screen.getByRole("button", { name: "Add a thing" })).toBeInTheDocument();
    expect(screen.getByText("The list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recent things/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hides the children but keeps the add button visible once collapsed", async () => {
    const user = userEvent.setup();
    renderPanel("test-b");

    await user.click(screen.getByRole("button", { name: /recent things/i }));

    // The whole point of keeping the add button in the always-visible header row: it must
    // never disappear, regardless of the content region's own collapsed state.
    expect(screen.getByRole("button", { name: "Add a thing" })).toBeInTheDocument();
    expect(screen.queryByText("The list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recent things/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("calls onAddClick and force-expands the panel when the add button is clicked while collapsed", async () => {
    const user = userEvent.setup();
    const onAddClick = vi.fn();
    renderPanel("test-f", onAddClick);

    await user.click(screen.getByRole("button", { name: /recent things/i }));
    expect(screen.queryByText("The list")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add a thing" }));

    expect(onAddClick).toHaveBeenCalledOnce();
    // A collapsed section's own add button is only reachable once expanded again - clicking it
    // has to expand the panel itself, not just fire the callback into content nobody can see.
    expect(screen.getByText("The list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recent things/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("persists the collapsed state across remounts under the same storageKey", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel("test-c");
    await user.click(screen.getByRole("button", { name: /recent things/i }));
    unmount();

    renderPanel("test-c");

    expect(screen.queryByText("The list")).not.toBeInTheDocument();
  });

  it("does not share collapsed state between different storageKeys", () => {
    window.localStorage.setItem("welltrack:collapsed:test-d", "true");

    renderPanel("test-e");

    expect(screen.getByText("The list")).toBeInTheDocument();
  });
});

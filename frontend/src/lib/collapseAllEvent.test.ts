import { describe, it, expect, vi } from "vitest";
import { dispatchCollapseAll, listenForCollapseAll } from "./collapseAllEvent";

describe("collapseAllEvent", () => {
  it("notifies a listener whose key falls under the broadcast prefix", () => {
    const onChange = vi.fn();
    const stop = listenForCollapseAll("categories.group.abc", onChange);

    dispatchCollapseAll("categories.group.", true);

    expect(onChange).toHaveBeenCalledWith(true);
    stop();
  });

  it("carries the requested state, so the same channel expands as well as collapses", () => {
    const onChange = vi.fn();
    const stop = listenForCollapseAll("categories.group.abc", onChange);

    dispatchCollapseAll("categories.group.", false);

    expect(onChange).toHaveBeenCalledWith(false);
    stop();
  });

  // The prefix is what scopes a broadcast to one set of sections - without it, collapsing the
  // category groups would also collapse Settings' unrelated sections.
  it("ignores a broadcast for a different prefix", () => {
    const onChange = vi.fn();
    const stop = listenForCollapseAll("settings.profile", onChange);

    dispatchCollapseAll("categories.group.", true);

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it("stops listening once cleaned up", () => {
    const onChange = vi.fn();
    const stop = listenForCollapseAll("categories.group.abc", onChange);
    stop();

    dispatchCollapseAll("categories.group.", true);

    expect(onChange).not.toHaveBeenCalled();
  });
});

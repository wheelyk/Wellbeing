import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders nothing at all when there's no message", () => {
    const { container } = render(<Toast message={null} />);

    // Not merely hidden - absent, so it can never sit invisibly over the page.
    expect(container).toBeEmptyDOMElement();
  });

  it("announces its message politely rather than interrupting", () => {
    render(<Toast message="Reminder saved." />);

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Reminder saved.");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("never intercepts taps meant for the content underneath it", () => {
    render(<Toast message="Reminder saved." />);

    // It floats over the list, so without this a toast could swallow a tap on the row behind it.
    expect(screen.getByRole("status")).toHaveClass("pointer-events-none");
  });
});

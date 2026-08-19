import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed, and its content when open", () => {
    const { rerender } = render(
      <Modal open={false} onClose={vi.fn()} title="Log a mood">
        <p>Form content</p>
      </Modal>,
    );
    expect(screen.queryByText("Form content")).not.toBeInTheDocument();

    rerender(
      <Modal open={true} onClose={vi.fn()} title="Log a mood">
        <p>Form content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Log a mood" })).toBeInTheDocument();
    expect(screen.getByText("Form content")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Log a mood">
        <p>Form content</p>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Log a mood">
        <p>Form content</p>
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked, but not when the dialog itself is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Log a mood">
        <p>Form content</p>
      </Modal>,
    );

    await user.click(screen.getByText("Form content"));
    expect(onClose).not.toHaveBeenCalled();

    // The backdrop is the only element with aria-hidden - everything else is real dialog content.
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns focus to the element that opened it once closed", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open dialog</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Log a mood">
            <p>Form content</p>
          </Modal>
        </>
      );
    }
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open dialog" });
    openButton.focus();
    await user.click(openButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryCreateForm } from "./CategoryCreateForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CategoryCreateForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a name and a type before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategoryCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText(/give this category a name/i)).toBeInTheDocument();
    expect(await screen.findByText(/choose how this is tracked/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a boolean category and calls onCreated with the server's response", async () => {
    const createdCategory = {
      id: "cat-1",
      userId: "user-1",
      name: "Read today",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdCategory));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(<CategoryCreateForm onCreated={onCreated} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/category name/i), "Read today");
    await user.click(screen.getByRole("radio", { name: /yes \/ no/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdCategory));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({ name: "Read today", valueType: "boolean" });
  });

  it("requires scaleMin < scaleMax for a scale category, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategoryCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/category name/i), "Energy level");
    await user.click(screen.getByRole("radio", { name: /scale/i }));
    await user.clear(screen.getByLabelText(/low end/i));
    await user.type(screen.getByLabelText(/low end/i), "5");
    await user.clear(screen.getByLabelText(/high end/i));
    await user.type(screen.getByLabelText(/high end/i), "1");
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText(/low end less than the high end/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a scale category with its default 1-7 bounds and an icon", async () => {
    const createdCategory = {
      id: "cat-2",
      userId: "user-1",
      name: "Energy level",
      icon: "⚡",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 7,
      archivedAt: null,
      createdAt: "2026-08-23T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdCategory));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(<CategoryCreateForm onCreated={onCreated} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/category name/i), "Energy level");
    await user.type(screen.getByLabelText(/icon/i), "⚡");
    await user.click(screen.getByRole("radio", { name: /scale/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdCategory));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    // 1-7, not 1-5 - a brand-new custom scale category defaults to the same house standard every
    // built-in scale category was unified onto (see docs/log/21-unify-scale-to-seven.md), unless
    // the user edits the bounds themselves.
    expect(body).toEqual({
      name: "Energy level",
      valueType: "scale",
      icon: "⚡",
      scaleMin: 1,
      scaleMax: 7,
    });
  });

  it("shows a friendly error when creating fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: { message: "Invalid category", code: "VALIDATION_ERROR" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CategoryCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/category name/i), "Sleep");
    await user.click(screen.getByRole("radio", { name: /duration/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(
      await screen.findByText(/something went wrong creating your category/i),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<CategoryCreateForm onCreated={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });
});

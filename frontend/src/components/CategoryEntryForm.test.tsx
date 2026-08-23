import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryEntryForm } from "./CategoryEntryForm";
import type { Category } from "./CategoryCreateForm";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const booleanCategory: Category = {
  id: "cat-bool",
  userId: "user-1",
  name: "Read today",
  icon: null,
  valueType: "boolean",
  scaleMin: null,
  scaleMax: null,
  archivedAt: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};
const numericCategory: Category = {
  id: "cat-numeric",
  userId: "user-1",
  name: "Water intake",
  icon: "💧",
  valueType: "numeric",
  scaleMin: null,
  scaleMax: null,
  archivedAt: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};
const scaleCategory: Category = {
  id: "cat-scale",
  userId: "user-1",
  name: "Energy level",
  icon: "⚡",
  valueType: "scale",
  scaleMin: 1,
  scaleMax: 5,
  archivedAt: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};
const durationCategory: Category = {
  id: "cat-duration",
  userId: "user-1",
  name: "Meditation",
  icon: null,
  valueType: "duration",
  scaleMin: null,
  scaleMax: null,
  archivedAt: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};

describe("CategoryEntryForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a Yes/No choice before submitting a boolean category", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <CategoryEntryForm
        categories={[booleanCategory]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose yes or no/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits valueNumeric for a numeric category", async () => {
    const createdLog = {
      id: "log-1",
      userId: "user-1",
      categoryId: numericCategory.id,
      valueBoolean: null,
      valueNumeric: 6,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdLog));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <CategoryEntryForm
        categories={[numericCategory]}
        onSaved={onSaved}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/^value$/i), "6");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog));

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({ categoryId: numericCategory.id, valueNumeric: 6 });
  });

  it("renders a scale category as a rating picker bounded by its own scaleMin/scaleMax", async () => {
    const createdLog = {
      id: "log-2",
      userId: "user-1",
      categoryId: scaleCategory.id,
      valueBoolean: null,
      valueNumeric: 4,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: "2026-08-23T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, createdLog));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <CategoryEntryForm
        categories={[scaleCategory]}
        onSaved={onSaved}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );

    // Exactly 5 options (1 through 5) for a scaleMin:1/scaleMax:5 category - not, say, an
    // unbounded free-text number input the way plain "numeric" gets.
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);

    await user.click(screen.getByRole("radio", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdLog));
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({ categoryId: scaleCategory.id, valueNumeric: 4 });
  });

  it("requires choosing a scale value before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <CategoryEntryForm
        categories={[scaleCategory]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/choose a value on the scale/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a negative duration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <CategoryEntryForm
        categories={[durationCategory]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/duration \(minutes\)/i), "-5");
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    expect(await screen.findByText(/enter a whole number of minutes/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches the value control when a different category is picked", async () => {
    const user = userEvent.setup();
    render(
      <CategoryEntryForm
        categories={[booleanCategory, numericCategory]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddCategory={vi.fn()}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: /completed/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^category$/i), numericCategory.id);

    expect(screen.queryByRole("radiogroup", { name: /completed/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^value$/i)).toBeInTheDocument();
  });

  it("calls onAddCategory when '+ Add a new category' is clicked", async () => {
    const user = userEvent.setup();
    const onAddCategory = vi.fn();

    render(
      <CategoryEntryForm
        categories={[booleanCategory]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onAddCategory={onAddCategory}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add a new category/i }));

    expect(onAddCategory).toHaveBeenCalled();
  });

  describe("editing an existing entry", () => {
    it("locks the category picker and PATCHes without categoryId, sending an explicit null to clear notes", async () => {
      const existingLog = {
        id: "log-1",
        userId: "user-1",
        categoryId: booleanCategory.id,
        valueBoolean: false,
        valueNumeric: null,
        valueDurationMinutes: null,
        notes: "Some note",
        loggedAt: "2026-08-23T08:30:00.000Z",
      };
      const updatedLog = { ...existingLog, valueBoolean: true, notes: null };
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse(200, updatedLog)));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      const onSaved = vi.fn();

      render(
        <CategoryEntryForm
          categories={[booleanCategory, numericCategory]}
          editingLog={existingLog}
          onSaved={onSaved}
          onCancel={vi.fn()}
          onAddCategory={vi.fn()}
        />,
      );

      expect(screen.getByLabelText(/^category$/i)).toHaveValue(booleanCategory.id);
      expect(screen.getByLabelText(/^category$/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "Yes" }));
      await user.clear(screen.getByLabelText(/notes/i));
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedLog));

      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toContain("/api/category-logs/log-1");
      expect(requestInit.method).toBe("PATCH");
      const body = JSON.parse(requestInit.body as string);
      expect(body).toMatchObject({ valueBoolean: true, notes: null });
      expect(body.categoryId).toBeUndefined();
    });

    it("pre-selects a scale category's existing value on the rating picker", () => {
      const existingLog = {
        id: "log-2",
        userId: "user-1",
        categoryId: scaleCategory.id,
        valueBoolean: null,
        valueNumeric: 3,
        valueDurationMinutes: null,
        notes: null,
        loggedAt: "2026-08-23T08:30:00.000Z",
      };

      render(
        <CategoryEntryForm
          categories={[scaleCategory]}
          editingLog={existingLog}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
          onAddCategory={vi.fn()}
        />,
      );

      expect(screen.getByRole("radio", { name: "3" })).toHaveAttribute("aria-checked", "true");
    });
  });
});

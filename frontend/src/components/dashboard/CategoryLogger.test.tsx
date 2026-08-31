import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryLogger } from "./CategoryLogger";
import { dispatchDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchTimelineAction } from "../../lib/dashboardTimelineActionEvent";
import { DASHBOARD_ENTRY_CHANGED_EVENT } from "../../lib/dashboardEntryChangedEvent";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const categories = [
  {
    id: "cat-anxiety",
    userId: null,
    name: "Anxiety",
    icon: "🧠",
    valueType: "boolean" as const,
    scaleMin: null,
    scaleMax: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
  },
  {
    id: "cat-sertraline",
    userId: null,
    name: "Sertraline",
    icon: "💊",
    valueType: "boolean" as const,
    scaleMin: null,
    scaleMax: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
  },
];

const anxietyLog = {
  id: "log-1",
  userId: "u1",
  categoryId: "cat-anxiety",
  valueBoolean: true,
  valueNumeric: null,
  valueDurationMinutes: null,
  notes: null,
  loggedAt: "2026-08-30T09:00:00.000Z",
};

// A single branching fetch mock, matching this app's own "auto-handle, override only when
// needed" convention (see DashboardPage.test.tsx) - every route CategoryLogger and the forms it
// opens can call, in one place, so each test only overrides what it's actually about.
function mockFetch(overrides: { categoriesDelayed?: boolean } = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/api/categories")) {
      if (overrides.categoriesDelayed) return new Promise(() => {}); // never resolves in this test
      return Promise.resolve(jsonResponse(200, categories));
    }
    if (url.endsWith("/api/category-logs/log-1")) {
      return Promise.resolve(jsonResponse(200, anxietyLog));
    }
    if (url.endsWith("/api/category-logs/missing")) {
      return Promise.resolve(
        jsonResponse(404, { error: { message: "Not found", code: "CATEGORY_LOG_NOT_FOUND" } }),
      );
    }
    if (url.endsWith("/api/category-logs") && init?.method === "POST") {
      return Promise.resolve(jsonResponse(201, { ...anxietyLog, id: "log-new" }));
    }
    if (url.includes("/api/category-logs/") && init?.method === "PATCH") {
      return Promise.resolve(jsonResponse(200, anxietyLog));
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryLogger", () => {
  it("opens the full, unlocked picker on the plain quick-add event", async () => {
    mockFetch();
    render(<CategoryLogger />);
    await waitFor(() => expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument());

    dispatchDashboardQuickAdd();

    expect(await screen.findByRole("dialog", { name: "Log an entry" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  // A real bug caught by driving this in an actual browser, not by an earlier version of this
  // test file: handleCategoryCreated originally reused the same helper the plain unlocked-picker
  // path uses, which hard-codes "nothing pre-selected" - so the form silently landed on whichever
  // category sorts first (here, "Anxiety", ahead of the brand-new one) instead of the category
  // just defined. Saving without noticing would log against the wrong thing entirely.
  it("pre-selects the category just created, not whichever sorts first", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/categories") && init?.method !== "POST") {
        return Promise.resolve(jsonResponse(200, categories));
      }
      if (url.endsWith("/api/categories") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(201, {
            id: "cat-zzz-water",
            userId: "u1",
            name: "Zzz Water",
            icon: null,
            valueType: "boolean",
            scaleMin: null,
            scaleMax: null,
            archivedAt: null,
            createdAt: "2026-08-31T00:00:00.000Z",
            groupId: null,
          }),
        );
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoryLogger />);
    const user = userEvent.setup();

    dispatchDashboardQuickAdd();
    await screen.findByRole("dialog", { name: "Log an entry" });
    await user.click(screen.getByRole("button", { name: /add a new category/i }));
    await screen.findByRole("dialog", { name: "Create a new category" });
    await user.type(screen.getByLabelText(/category name/i), "Zzz Water");
    await user.click(screen.getByRole("radio", { name: /yes \/ no/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await screen.findByRole("dialog", { name: "Log an entry" });
    expect(screen.getByLabelText("Category")).toHaveValue("cat-zzz-water");
  });

  it("opens category creation directly when the account has no categories yet", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/api/categories")) return Promise.resolve(jsonResponse(200, []));
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoryLogger />);

    dispatchDashboardQuickAdd();

    expect(
      await screen.findByRole("dialog", { name: "Create your first category" }),
    ).toBeInTheDocument();
  });

  // The race CategorySection's own pendingAdd existed to close (see docs/log/49): a trigger that
  // arrives before the initial categories fetch has resolved must still open, once it does,
  // rather than being silently dropped.
  it("resolves a trigger that arrived before the categories fetch finished", async () => {
    let resolveCategories!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/api/categories")) {
        return new Promise<Response>((resolve) => {
          resolveCategories = resolve;
        });
      }
      throw new Error(`Unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoryLogger />);

    dispatchDashboardQuickAdd();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    resolveCategories(jsonResponse(200, categories));

    expect(await screen.findByRole("dialog", { name: "Log an entry" })).toBeInTheDocument();
  });

  it("opens locked to one category for a Timeline add action", async () => {
    mockFetch();
    render(<CategoryLogger />);

    dispatchTimelineAction({ type: "add", categoryId: "cat-anxiety" });

    expect(await screen.findByRole("dialog", { name: "Log an entry" })).toBeInTheDocument();
    // Locked - no picker, unlike the unlocked quick-add case above.
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Completed?" })).toBeInTheDocument();
  });

  it("falls back to the full picker when a Timeline add names a category that's gone", async () => {
    mockFetch();
    render(<CategoryLogger />);

    dispatchTimelineAction({ type: "add", categoryId: "cat-deleted" });

    expect(await screen.findByRole("dialog", { name: "Log an entry" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("opens an unlocked picker for a Timeline add with no category (a GENERAL row)", async () => {
    mockFetch();
    render(<CategoryLogger />);

    dispatchTimelineAction({ type: "add", categoryId: null });

    expect(await screen.findByRole("dialog", { name: "Log an entry" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("fetches and opens the exact log for a Timeline edit action, locked to its category", async () => {
    mockFetch();
    render(<CategoryLogger />);

    dispatchTimelineAction({ type: "edit", logId: "log-1" });

    expect(await screen.findByRole("dialog", { name: "Edit entry" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    // The existing value pre-fills the form - "Yes" already selected, not a blank form.
    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
  });

  it("reports an error rather than opening nothing when the edited log can't be found", async () => {
    mockFetch();
    render(<CategoryLogger />);

    dispatchTimelineAction({ type: "edit", logId: "missing" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't open that entry/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes, confirms, and announces the change after a successful save", async () => {
    mockFetch();
    const changeHandler = vi.fn();
    window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, changeHandler);
    render(<CategoryLogger />);
    const user = userEvent.setup();

    dispatchDashboardQuickAdd();
    await screen.findByRole("dialog", { name: "Log an entry" });
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Entry saved.")).toBeInTheDocument();
    expect(changeHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, changeHandler);
  });
});

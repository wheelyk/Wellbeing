import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { HistoryPage } from "./HistoryPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/history"]}>
        <HistoryPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

// HistoryPage now fires a second, independent fetch on mount (GET /api/categories, to populate
// the Category filter's own options - see HistoryPage.tsx's own comment) alongside GET
// /api/history. Most tests below don't care about that list at all, so this gives it a harmless
// empty-array default; a test that actually needs real categories (e.g. to exercise the edit
// form's own category picker) still defines its own fetchMock directly instead of using this.
function mockHistoryFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/categories")) {
      return Promise.resolve(jsonResponse(200, []));
    }
    return Promise.resolve(handler(url, init));
  });
}

// categoryName/categoryIcon/value are separate fields now, not one pre-joined "Name: value"
// label (see HistoryPage.tsx's own comment on why - docs/log/53-history-redesign.md) - every
// fixture below reflects that real shape, and assertions check the name and the value pill as
// two separate pieces of text rather than one combined string.
describe("HistoryPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom's own default - reset explicitly since the visibilitychange tests below override it.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("renders fetched entries grouped by date, most recent first", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, {
        entries: [
          {
            id: "mood-1",
            categoryName: "Mood",
            categoryIcon: null,
            value: "4/5",
            notes: null,
            loggedAt: "2026-08-17T14:00:00.000Z",
          },
          {
            id: "category-1",
            categoryName: "Headache",
            categoryIcon: null,
            value: "6/10",
            notes: "Started after lunch",
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
          {
            id: "category-2",
            categoryName: "Exercise",
            categoryIcon: null,
            value: "Done",
            notes: null,
            loggedAt: "2026-08-16T14:00:00.000Z",
          },
        ],
        limit: 20,
        offset: 0,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText("Mood")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("6/10")).toBeInTheDocument();
    expect(screen.getByText("Started after lunch")).toBeInTheDocument();
    expect(screen.getByText("Exercise")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    // Two distinct calendar days -> two date-group headings, each starting with a weekday name
    // (e.g. "Monday, August 17, 2026") - narrower than all level-2 headings on the page, which
    // also includes the (unrelated) collapsible Filters section's own heading.
    expect(screen.getAllByRole("heading", { level: 2, name: /^[A-Za-z]+day,/ })).toHaveLength(2);
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = mockHistoryFetch(() => jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText(/couldn't load your history/i)).toBeInTheDocument();
  });

  it("renders a category entry, with its icon shown before the name", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, {
        entries: [
          {
            id: "cat-log-1",
            categoryName: "Energy level",
            categoryIcon: "⚡",
            value: "4/5",
            notes: null,
            loggedAt: "2026-08-17T09:00:00.000Z",
          },
        ],
        limit: 20,
        offset: 0,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText("⚡ Energy level")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("filters by category via the Category select, refetching with ?categoryId=", async () => {
    const category = {
      id: "cat-1",
      userId: "user-1",
      name: "Ibuprofen",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/categories")) {
        return Promise.resolve(jsonResponse(200, [category]));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/nothing to show yet/i);
    expect(screen.getByRole("option", { name: "Ibuprofen" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^category$/i), "cat-1");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls
        .map(([callUrl]) => String(callUrl))
        .filter((callUrl) => callUrl.includes("/api/history"))
        .at(-1);
      expect(lastCall).toContain("categoryId=cat-1");
    });
  });

  it("deletes an entry via /api/category-logs", async () => {
    const entry = {
      id: "cat-log-1",
      categoryName: "Energy level",
      categoryIcon: null,
      value: "4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = mockHistoryFetch((_url, init) => {
      if (init?.method === "DELETE") return jsonResponse(200, { message: "Deleted" });
      return jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Energy level");

    await user.click(screen.getByRole("button", { name: /delete entry/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(deleteCall?.[0]).toContain("/api/category-logs/cat-log-1");
    });
  });

  it("deletes an entry optimistically, rolling back on failure", async () => {
    const entry = {
      id: "cat-log-1",
      categoryName: "Ibuprofen",
      categoryIcon: null,
      value: "Done",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    let deleteCallCount = 0;
    const fetchMock = mockHistoryFetch((_url, init) => {
      if (init?.method === "DELETE") {
        deleteCallCount += 1;
        return jsonResponse(500, { error: { message: "Server error" } });
      }
      return jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Ibuprofen");

    // Delete now opens this app's own Modal-based confirmation dialog rather than a native
    // window.confirm() popup - clicking the row's Delete button only opens it; the actual
    // delete request only fires once the dialog's own "Delete" button is clicked.
    await user.click(screen.getByRole("button", { name: /delete entry/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    // Optimistically removed, then rolled back once the DELETE call fails.
    await screen.findByText("Ibuprofen");
    expect(deleteCallCount).toBe(1);
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(deleteCall?.[0]).toContain(`/api/category-logs/${entry.id}`);
  });

  it("deletes an entry and keeps it removed when the DELETE call succeeds", async () => {
    const entry = {
      id: "mood-1",
      categoryName: "Mood",
      categoryIcon: null,
      value: "4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = mockHistoryFetch((_url, init) => {
      if (init?.method === "DELETE") return jsonResponse(200, { message: "Deleted" });
      return jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood");

    await user.click(screen.getByRole("button", { name: /delete entry/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Mood")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("does not delete when the confirmation dialog is cancelled", async () => {
    const entry = {
      id: "mood-1",
      categoryName: "Mood",
      categoryIcon: null,
      value: "4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood");

    await user.click(screen.getByRole("button", { name: /delete entry/i }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Mood")).toBeInTheDocument();
    // The dialog itself closed, and no DELETE request against this entry was ever made -
    // AuthProvider's own mount-time rehydration attempt calls fetch once on its own, regardless
    // of this page, so only "was a delete request made" matters here.
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes("/mood-1") && init?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const first = {
      id: "mood-1",
      categoryName: "Mood",
      categoryIcon: null,
      value: "4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "mood-2",
      categoryName: "Mood",
      categoryIcon: null,
      value: "2/5",
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = mockHistoryFetch((url) => {
      if (url.includes("offset=1")) {
        return jsonResponse(200, { entries: [second], limit: 20, offset: 1, hasMore: false });
      }
      return jsonResponse(200, { entries: [first], limit: 20, offset: 0, hasMore: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("4/5");
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getAllByText("Mood")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows Load less once more than a page is loaded, and it collapses back without a new fetch", async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => ({
      id: `mood-${i}`,
      categoryName: "Mood",
      categoryIcon: null,
      value: "3/5",
      notes: null,
      loggedAt: `2026-08-17T${String(9 + (i % 12)).padStart(2, "0")}:00:00.000Z`,
    }));
    const twentyFirst = {
      id: "mood-20",
      categoryName: "Mood",
      categoryIcon: null,
      value: "5/5",
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = mockHistoryFetch((url) => {
      if (url.includes("offset=20")) {
        return jsonResponse(200, { entries: [twentyFirst], limit: 20, offset: 20, hasMore: false });
      }
      return jsonResponse(200, { entries: firstPage, limit: 20, offset: 0, hasMore: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByText("3/5");
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("5/5");
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load less/i })).toBeInTheDocument();

    const callsBeforeLoadLess = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /load less/i }));

    expect(fetchMock.mock.calls.length).toBe(callsBeforeLoadLess);
    expect(screen.queryByText("5/5")).not.toBeInTheDocument();
    expect(screen.getAllByText("3/5")).toHaveLength(20);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();
  });

  it("collapses one date group without affecting another", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, {
        entries: [
          {
            id: "mood-1",
            categoryName: "Mood",
            categoryIcon: null,
            value: "4/5",
            notes: null,
            loggedAt: "2026-08-17T14:00:00.000Z",
          },
          {
            id: "category-1",
            categoryName: "Exercise",
            categoryIcon: null,
            value: "Done",
            notes: null,
            loggedAt: "2026-08-16T14:00:00.000Z",
          },
        ],
        limit: 20,
        offset: 0,
        hasMore: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood");
    expect(screen.getByText("Exercise")).toBeInTheDocument();

    // dateHeading always starts with a weekday name followed by a comma (e.g. "Monday, August
    // 17, 2026") - narrower than matching on a year, which the per-entry Delete buttons' own
    // accessible names (built from the full loggedAt timestamp) also happen to contain.
    const groupHeadings = screen.getAllByRole("button", { name: /^[A-Za-z]+day,/ });
    expect(groupHeadings).toHaveLength(2);
    await user.click(groupHeadings[0]);

    expect(screen.queryByText("Mood")).not.toBeInTheDocument();
    // The other day's group is untouched.
    expect(screen.getByText("Exercise")).toBeInTheDocument();
  });

  it("collapses the Filters section, hiding the fields but not the entry list", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/nothing to show yet/i);
    expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^filters$/i }));

    expect(screen.queryByLabelText(/^from$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^to$/i)).not.toBeInTheDocument();
    // Collapsing the filter fields doesn't touch the rest of the page.
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("resolves a category entry's name via /api/categories and PATCHes the category-logs endpoint on save", async () => {
    const entry = {
      id: "cat-log-1",
      categoryName: "Energy level",
      categoryIcon: "⚡",
      value: "4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fullCategoryLog = {
      id: "cat-log-1",
      userId: "user-1",
      categoryId: "cat-energy",
      valueBoolean: null,
      valueNumeric: 4,
      valueDurationMinutes: null,
      notes: null,
      loggedAt: entry.loggedAt,
    };
    const updatedCategoryLog = { ...fullCategoryLog, valueNumeric: 5 };
    const categories = [
      {
        id: "cat-energy",
        userId: "user-1",
        name: "Energy level",
        icon: "⚡",
        valueType: "scale",
        scaleMin: 1,
        scaleMax: 5,
        archivedAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/api/category-logs/cat-log-1")) {
        return Promise.resolve(jsonResponse(200, updatedCategoryLog));
      }
      if (url.includes("/api/history")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/category-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [fullCategoryLog], limit: 100, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/categories")) {
        return Promise.resolve(jsonResponse(200, categories));
      }
      return Promise.resolve(jsonResponse(401, { error: { message: "No session" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    // Scoped to a <span> - the Category filter's own <option> for this same category renders the
    // identical "⚡ Energy level" text (see CategoryCreateForm's own icon-plus-name convention),
    // so a plain findByText would (correctly) complain about matching both.
    await screen.findByText("⚡ Energy level", { selector: "span" });
    expect(screen.getByText("4/5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit entry/i }));
    await screen.findByRole("heading", { name: "Edit entry" });

    // Pre-filled with the real category, resolved from /api/categories via the log's
    // categoryId - and a scale category renders as a RatingScale, matching its scaleMin/scaleMax.
    expect(screen.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          String(callUrl).includes("/api/category-logs/cat-log-1") && callInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body));
      expect(body.valueNumeric).toBe(5);
    });

    // The updated log's own category (resolved from /api/categories, same icon) is what
    // HistoryEditModal's onSaved uses to build the new value pill locally - "5/5", not a bare
    // "5", since Energy level is a scale category with scaleMax 5.
    expect(await screen.findByText("5/5")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Edit entry" })).not.toBeInTheDocument();
  });

  // Real bug, caught in production right after this page's own redesign shipped: a request that
  // landed on the backend mid-deploy got served the pre-redesign response shape (a plain `label`
  // string), and the new frontend rendered that as blank name/value text rather than an error,
  // since GET /api/history's own load effect never refetches again on its own once it succeeds
  // once. Refetching on a real transition back to "visible" is the fix - see HistoryPage.tsx's
  // own comment on why, and TimelinePanel.test.tsx's identical pair of tests for the same fix
  // there.
  it("refetches when the tab becomes visible again", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await screen.findByText(/nothing to show yet/i);
    const callsBefore = fetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/history"))).toBe(true);
  });

  it("does not refetch on a visibilitychange that leaves the tab hidden", async () => {
    const fetchMock = mockHistoryFetch(() =>
      jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await screen.findByText(/nothing to show yet/i);
    const callsBefore = fetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Nothing useful to fetch while backgrounded - the point is the transition back into view,
    // not every visibility flicker.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});

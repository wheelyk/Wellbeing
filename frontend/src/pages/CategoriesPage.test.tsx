import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { CategoriesPage } from "./CategoriesPage";
import { DASHBOARD_ENTRY_CHANGED_EVENT } from "../lib/dashboardEntryChangedEvent";

// The test environment's own `window.localStorage` (Node's built-in, not jsdom's) is a
// non-functional stub with no working setItem/getItem/clear - unrelated to this app's own code.
// See CollapsibleSection.test.tsx / SectionPanel.test.tsx for the same workaround this codebase
// already established: a real, working Storage stood in via vi.stubGlobal, needed here because
// the "appearance" tests below specifically exercise useThemePreference's persistence.
// The test environment own window.localStorage (Node built-in, not jsdom) is a non-functional
// stub with no working setItem/getItem/clear. See CollapsibleSection.test.tsx for the same
// workaround: a real, working Storage stood in via vi.stubGlobal. Needed here because the
// collapsed state of "Deleted categories" is persisted through it.
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A save/delete anywhere Timeline's data depends on should announce it the same way a category
// log or task save already does (see dashboardEntryChangedEvent.ts) - Timeline itself doesn't
// need to be rendered for this to matter, so these tests just count the dispatch directly rather
// than mounting a second page to observe a refetch.
function captureEntryChanged(): { count: () => number } {
  let count = 0;
  const handler = () => {
    count += 1;
  };
  window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
  return { count: () => count };
}

function renderCategoriesPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/categories"]}>
        <Routes>
          <Route path="/categories" element={<CategoriesPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const DEFAULT_PROFILE = {
  id: "user-1",
  email: "test@example.com",
  displayName: "Test User",
  timezone: "UTC",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// Every CategoriesPage render fires several fetches on mount regardless of which one a given
// test cares about: AuthProvider own session-rehydration POST to /api/auth/refresh, plus the
// categories, groups and reminders the page loads together. A url-matching mockImplementation
// (the same pattern DashboardPage.test.tsx uses, for the same reason) is what lets each test
// specify only the routes it actually cares about, regardless of the order React fires them in.
function routedFetchMock(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/auth/refresh")) {
      return Promise.resolve(
        overrides["/api/auth/refresh"]?.(init) ??
          jsonResponse(401, { error: { message: "no refresh cookie" } }),
      );
    }
    if (url.includes("/api/users/me") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(
        overrides["GET /api/users/me"]?.(init) ?? jsonResponse(200, DEFAULT_PROFILE),
      );
    }
    // CategoriesSection fetches this alongside /api/categories on every mount (see
    // docs/log/23-category-groups.md) - defaulted to empty here so every pre-existing test that
    // exercises that section doesn't need to know about groups at all unless it specifically
    // cares, the same "auto-handle, override only when needed" convention as the two cases above.
    if (url.includes("/api/category-groups") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(overrides["/api/category-groups"]?.(init) ?? jsonResponse(200, []));
    }
    if (url.includes("/api/reminders") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(overrides["GET /api/reminders"]?.(init) ?? jsonResponse(200, []));
    }
    for (const [key, respond] of Object.entries(overrides)) {
      const [method, path] = key.includes(" ") ? key.split(" ") : [undefined, key];
      if (url.includes(path) && (!method || init?.method === method)) {
        return Promise.resolve(respond(init));
      }
    }
    throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`);
  });
}
describe("CategoriesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const ownCategory = {
    id: "cat-own",
    userId: "user-1",
    name: "Water intake",
    icon: "💧",
    valueType: "numeric",
    scaleMin: null,
    scaleMax: null,
    archivedAt: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  };
  const systemCategory = {
    id: "cat-system",
    userId: null,
    name: "Sleep hours",
    icon: "😴",
    valueType: "numeric",
    scaleMin: null,
    scaleMax: null,
    archivedAt: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  };

  // Session rehydration (AuthProvider's own refresh call) has to succeed and return the same
  // user id DEFAULT_PROFILE uses, so CategoriesSection's own "is this my category" check
  // (comparing against useAuth()'s user.id) actually has a real id to compare against - without
  // this override, /api/auth/refresh 401s by default (see routedFetchMock's own comment) and
  // every category would render as if it belonged to someone else.
  function withAuthedUser(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
    return routedFetchMock({
      "/api/auth/refresh": () =>
        jsonResponse(200, { user: DEFAULT_PROFILE, accessToken: "test-token" }),
      ...overrides,
    });
  }

  it("hides the admin link for a non-admin user", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, []),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCategoriesPage();

    await screen.findByText(/no categories yet/i);
    expect(screen.queryByText(/manage global categories/i)).not.toBeInTheDocument();
  });

  it("shows the admin link only for the isAdmin account", async () => {
    const fetchMock = routedFetchMock({
      "/api/auth/refresh": () =>
        jsonResponse(200, {
          user: { ...DEFAULT_PROFILE, isAdmin: true },
          accessToken: "test-token",
        }),
      "/api/categories": () => jsonResponse(200, []),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCategoriesPage();

    expect(await screen.findByText(/manage global categories/i)).toBeInTheDocument();
  });

  it("lists categories, distinguishing built-in (system) ones from the user's own", async () => {
    // A bare (method-less) key, not "GET /api/categories" - apiFetch never sets an explicit
    // `method` for a plain GET (see api/client.ts), so an exact "GET" match would never fire;
    // routedFetchMock's method-less keys match any request, which is exactly right here since
    // this test has no other method hitting this same path to disambiguate from.
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [ownCategory, systemCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCategoriesPage();

    expect(await screen.findByText(/water intake/i)).toBeInTheDocument();
    expect(screen.getByText(/sleep hours/i)).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();

    // Only the user's own category gets Edit/Delete actions - the system one has none.
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete Water intake" })).toHaveLength(1);
  });

  it("creates a new category and shows it in the list", async () => {
    const createdCategory = {
      id: "cat-new",
      userId: "user-1",
      name: "Reading",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
    };
    // Method-specific override listed first - the loop returns on first match, and a bare
    // (method-less) key would otherwise catch the POST request too before this one is checked.
    const fetchMock = withAuthedUser({
      "POST /api/categories": () => jsonResponse(201, createdCategory),
      "/api/categories": () => jsonResponse(200, []),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText(/no categories yet/i);
    await user.click(screen.getByRole("button", { name: "+ New category" }));
    await user.type(screen.getByLabelText(/category name/i), "Reading");
    await user.click(screen.getByRole("radio", { name: /yes \/ no/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText(/reading/i)).toBeInTheDocument();
    expect(await screen.findByText(/category created/i)).toBeInTheDocument();
  });

  it("edits the user's own category's name and icon", async () => {
    const updatedCategory = { ...ownCategory, name: "Daily water", icon: "🚰" };
    const fetchMock = withAuthedUser({
      "PATCH /api/categories": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...ownCategory, ...body });
      },
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText(/water intake/i);
    await user.click(screen.getByRole("button", { name: "Edit Water intake" }));
    const nameField = screen.getByLabelText(/^name$/i);
    await user.clear(nameField);
    await user.type(nameField, updatedCategory.name);
    // Scoped to the category row itself - "Save" alone is ambiguous against the page's other
    // "Save"/"Save profile" buttons (e.g. Reminders' own submit button) once every section is
    // rendered together.
    const editRow = nameField.closest("li") as HTMLElement;
    await user.click(within(editRow).getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/daily water/i)).toBeInTheDocument();
  });

  it("soft-deletes the user's own category (not a hard delete), via a real confirmation dialog, and removes it from the list", async () => {
    const fetchMock = withAuthedUser({
      "DELETE /api/categories": () =>
        jsonResponse(200, { ...ownCategory, archivedAt: "2026-08-23T12:00:00.000Z" }),
      "/api/categories/deleted": () => jsonResponse(200, []),
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText(/water intake/i);
    await user.click(screen.getByRole("button", { name: "Delete Water intake" }));

    // Delete goes through this app's own Modal-based confirmation dialog (ConfirmDeleteModal)
    // rather than a native window.confirm() popup - clicking the row's own Delete button only
    // opens it; the actual DELETE request only fires once the dialog's own "Delete" button (its
    // exact accessible name, unambiguous once the row's own button is scoped to "Delete Water
    // intake" above) is clicked.
    expect(await screen.findByText(/delete category\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(/category deleted.*restore it from deleted categories/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/water intake/i)).not.toBeInTheDocument();
  });

  it("never shows Edit/Delete for a system category", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [systemCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCategoriesPage();

    await screen.findByText(/sleep hours/i);
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    // Scoped to this specific category's own name, not a bare /^Delete /i - the page also has an
    // unrelated "Delete account" section further down, which a looser pattern would match too.
    expect(
      screen.queryByRole("button", { name: `Delete ${systemCategory.name}` }),
    ).not.toBeInTheDocument();
  });

  it("cancelling the delete confirmation leaves the category untouched, with no DELETE request sent", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText(/water intake/i);
    await user.click(screen.getByRole("button", { name: "Delete Water intake" }));
    expect(await screen.findByText(/delete category\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/delete category\?/i)).not.toBeInTheDocument();
    // Scoped to the row's own Delete button, not a bare "water intake" text query - Reminders'
    // own category picker (elsewhere on this same page) independently renders "Water intake" too
    // once its own fetch resolves, which would otherwise make this an ambiguous, flaky match.
    expect(screen.getByRole("button", { name: "Delete Water intake" })).toBeInTheDocument();
    const deleteCalls = fetchMock.mock.calls.filter(
      (call) => call[1]?.method === "DELETE" && String(call[0]).includes("/api/categories"),
    );
    expect(deleteCalls).toHaveLength(0);
  });

  describe("Deleted categories", () => {
    // "Deleted categories" defaults to collapsed (see CollapsibleSection's defaultCollapsed
    // prop), and these tests click it open, which persists that "expanded" choice to
    // localStorage - reusing this file's own stubWorkingLocalStorage (see its own comment above)
    // so one test's own toggle can never leave the section stuck open (or closed) for the next
    // one, the same isolation reason the "appearance" tests already need it for.
    beforeEach(() => {
      stubWorkingLocalStorage();
    });

    const deletedNoLogs = {
      id: "cat-deleted-empty",
      userId: "user-1",
      name: "Old habit",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      // 3 days from a purgeEligibleAt fixed relative to Date.now() at test-run time - the exact
      // "how many days left" text this asserts on is computed the same way in both the component
      // and this fixture, so it stays correct regardless of when the suite actually runs.
      purgeEligibleAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      hasLogs: false,
    };
    const deletedWithLogs = {
      id: "cat-deleted-haslogs",
      userId: "user-1",
      name: "Old symptom",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      purgeEligibleAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      hasLogs: true,
    };

    it("lazily fetches and lists deleted categories only once the section is expanded", async () => {
      const deletedFetch = vi.fn(() => jsonResponse(200, [deletedNoLogs, deletedWithLogs]));
      const fetchMock = withAuthedUser({
        "/api/categories/deleted": deletedFetch,
        "/api/categories": () => jsonResponse(200, []),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderCategoriesPage();

      await screen.findByText(/no categories yet/i);
      expect(deletedFetch).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Deleted categories" }));

      expect(await screen.findByText("Old habit")).toBeInTheDocument();
      expect(screen.getByText(/permanently removed in 3 days/i)).toBeInTheDocument();
      expect(screen.getByText("Old symptom")).toBeInTheDocument();
      expect(screen.getByText(/has entries, so it's kept/i)).toBeInTheDocument();
    });

    it("restores a deleted category, moving it back into the main list and off the deleted list", async () => {
      const restoredCategory = { ...deletedNoLogs, archivedAt: null };
      const fetchMock = withAuthedUser({
        "POST /api/categories/cat-deleted-empty/restore": () => jsonResponse(200, restoredCategory),
        "/api/categories/deleted": () => jsonResponse(200, [deletedNoLogs]),
        "/api/categories": () => jsonResponse(200, []),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderCategoriesPage();

      await screen.findByText(/no categories yet/i);
      await user.click(screen.getByRole("button", { name: "Deleted categories" }));
      await screen.findByText("Old habit");

      await user.click(screen.getByRole("button", { name: "Restore" }));

      // Gone from the Deleted section first (its own list re-renders without it)...
      await waitFor(() =>
        expect(screen.queryByText(/permanently removed in/i)).not.toBeInTheDocument(),
      );
      // ...and back in the main (non-deleted) list - a single remaining match proves it moved
      // rather than merely disappearing from one list without appearing in the other.
      expect(screen.getByText("Old habit")).toBeInTheDocument();
    });
  });

  // Hide/Unhide (Phase 17, Task 1's HiddenCategory mechanism) is what actually replaces the old
  // blunt symptomEnabled toggle for former system symptoms - see
  // docs/log/17-unify-mood-symptom-habit.md's Task 5 entry. Offered only for a system category
  // (never the user's own, which is archived instead - see the test above/below).
  it("hides a system category and shows it as Hidden, offering Unhide instead", async () => {
    const fetchMock = withAuthedUser({
      "POST /api/categories/cat-system/hide": () =>
        jsonResponse(200, { message: "Category hidden" }),
      "/api/categories": () => jsonResponse(200, [systemCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText(/sleep hours/i);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide Sleep hours" }));

    expect(await screen.findByText("Hidden")).toBeInTheDocument();
    expect(await screen.findByText(/category hidden/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unhide Sleep hours" })).toBeInTheDocument();
  });

  it("unhides an already-hidden system category", async () => {
    const fetchMock = withAuthedUser({
      "DELETE /api/categories/cat-system/hide": () =>
        jsonResponse(200, { message: "Category unhidden" }),
      "/api/categories": () => jsonResponse(200, [{ ...systemCategory, hidden: true }]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCategoriesPage();

    await screen.findByText("Hidden");
    await user.click(screen.getByRole("button", { name: "Unhide Sleep hours" }));

    expect(await screen.findByText(/category unhidden/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide Sleep hours" })).toBeInTheDocument();
  });

  it("never offers Hide/Unhide for the user's own category", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCategoriesPage();

    await screen.findByText(/water intake/i);
    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unhide" })).not.toBeInTheDocument();
  });

  // A category can now carry two reminders at once - its ordinary standing schedule, and a
  // temporary one running only until tonight (see
  // docs/log/38-reminder-stop-condition-and-follow-ups.md). The row has to show both without
  // confusing them, and the bell has to keep editing the standing one.
  describe("a category with both a standing and a temporary reminder", () => {
    const standingReminder = {
      id: "rem-standing",
      userId: "user-1",
      target: "category",
      categoryId: "cat-own",
      category: { name: "Water intake", icon: "💧" },
      schedules: ["0 9 * * *"],
      enabled: true,
      expiresAt: null,
      stopsWhenLogged: true,
      createdAt: "2026-08-29T00:00:00.000Z",
    };
    const temporaryReminder = {
      ...standingReminder,
      id: "rem-temporary",
      schedules: ["0 */2 * * *"],
      expiresAt: "2026-08-29T23:00:00.000Z",
      stopsWhenLogged: false,
    };

    function withBothReminders(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
      return withAuthedUser({
        "/api/categories": () => jsonResponse(200, [ownCategory]),
        "GET /api/reminders": () => jsonResponse(200, [standingReminder, temporaryReminder]),
        ...overrides,
      });
    }

    it("shows both, marking the temporary one as being just for today", async () => {
      vi.stubGlobal("fetch", withBothReminders());
      renderCategoriesPage();

      await screen.findByText(/water intake/i);
      // The standing schedule reads as it always has...
      expect(screen.getByText(/09:00 daily/)).toBeInTheDocument();
      // ...and the temporary one is labelled rather than sitting alongside it looking permanent.
      // Before the page told the two apart, only one of them appeared at all - whichever happened
      // to come last in the response.
      expect(screen.getByText("Just for today")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    });

    it("stops the temporary one without touching the standing one", async () => {
      const fetchMock = withBothReminders({
        "DELETE /api/reminders": () => jsonResponse(200, { message: "Deleted" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      renderCategoriesPage();
      const user = userEvent.setup();

      await screen.findByText("Just for today");
      await user.click(screen.getByRole("button", { name: "Stop" }));

      await waitFor(() => expect(screen.queryByText("Just for today")).not.toBeInTheDocument());
      // The standing reminder is untouched - still listed, still on its own schedule.
      expect(screen.getByText(/09:00 daily/)).toBeInTheDocument();

      // And it is genuinely the temporary one that was deleted, not merely something that
      // disappeared from the screen.
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(deleteCall?.[0])).toContain("/api/reminders/rem-temporary");
    });

    it("opens the bell on the standing reminder, not the temporary one", async () => {
      vi.stubGlobal("fetch", withBothReminders());
      renderCategoriesPage();
      const user = userEvent.setup();

      await screen.findByText(/water intake/i);
      await user.click(screen.getByRole("button", { name: /Edit reminder for Water intake/ }));

      // 09:00 is the standing reminder's own time; the temporary one is an every-two-hours
      // expression with no time list at all, so this is unambiguous.
      expect(await screen.findByText("09:00")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /Only for today/ })).not.toBeChecked();
    });

    // The bug this pins: Timeline's own data (see TimelinePanel.tsx) can add, remove, or move a
    // row for today whenever a reminder's schedule changes, but until this fix, reminder CRUD
    // living on this page (and on Settings - see SettingsPage.test.tsx's own version of this same
    // test) never told Timeline anything had changed at all, so it only ever caught up on its own
    // next full remount rather than being told directly.
    it("stopping the temporary reminder announces the change to the rest of the dashboard", async () => {
      const fetchMock = withBothReminders({
        "DELETE /api/reminders": () => jsonResponse(200, { message: "Deleted" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const entryChanged = captureEntryChanged();
      renderCategoriesPage();
      const user = userEvent.setup();

      await screen.findByText("Just for today");
      await user.click(screen.getByRole("button", { name: "Stop" }));

      await waitFor(() => expect(screen.queryByText("Just for today")).not.toBeInTheDocument());
      expect(entryChanged.count()).toBe(1);
    });

    it("turning off the standing reminder announces the change to the rest of the dashboard", async () => {
      const fetchMock = withBothReminders({
        "DELETE /api/reminders": () => jsonResponse(200, { message: "Deleted" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const entryChanged = captureEntryChanged();
      renderCategoriesPage();
      const user = userEvent.setup();

      await screen.findByRole("button", { name: /Edit reminder for Water intake/ });
      await user.click(screen.getByRole("button", { name: /Edit reminder for Water intake/ }));
      await user.click(await screen.findByRole("button", { name: "Turn off" }));

      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /Edit reminder for Water intake/ }),
        ).not.toBeInTheDocument(),
      );
      expect(entryChanged.count()).toBe(1);
    });
  });

  it("saving a brand-new reminder announces the change to the rest of the dashboard", async () => {
    const savedReminder = {
      id: "rem-new",
      userId: "user-1",
      target: "category",
      categoryId: "cat-own",
      category: { name: "Water intake", icon: "💧" },
      schedules: ["0 9 * * *"],
      enabled: true,
      expiresAt: null,
      stopsWhenLogged: true,
      createdAt: "2026-08-31T00:00:00.000Z",
    };
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [ownCategory]),
      "GET /api/reminders": () => jsonResponse(200, []),
      "POST /api/reminders": () => jsonResponse(201, savedReminder),
    });
    vi.stubGlobal("fetch", fetchMock);
    const entryChanged = captureEntryChanged();
    renderCategoriesPage();
    const user = userEvent.setup();

    await screen.findByRole("button", { name: /Remind me about Water intake/ });
    await user.click(screen.getByRole("button", { name: /Remind me about Water intake/ }));
    await user.click(await screen.findByRole("button", { name: "Save reminder" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Remind me about Water intake/ }),
      ).not.toBeInTheDocument(),
    );
    expect(entryChanged.count()).toBe(1);
  });
});

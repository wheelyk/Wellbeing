import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { SettingsPage } from "./SettingsPage";
import * as pushNotifications from "../lib/pushNotifications";

// RemindersSection's own tests mock this whole module rather than simulating jsdom's complete
// lack of a real Push API (no serviceWorker/PushManager/Notification implementation at all) -
// pushNotifications.ts's own test file already covers its real browser-facing logic directly;
// this page only needs to prove it calls that module correctly and handles what it returns.
vi.mock("../lib/pushNotifications", async () => {
  const actual = await vi.importActual<typeof import("../lib/pushNotifications")>(
    "../lib/pushNotifications",
  );
  return {
    ...actual,
    isPushSupported: vi.fn(() => true),
    subscribeToPush: vi.fn(async () => {}),
    unsubscribeFromPush: vi.fn(async () => {}),
  };
});

// The test environment's own `window.localStorage` (Node's built-in, not jsdom's) is a
// non-functional stub with no working setItem/getItem/clear - unrelated to this app's own code.
// See CollapsibleSection.test.tsx / SectionPanel.test.tsx for the same workaround this codebase
// already established: a real, working Storage stood in via vi.stubGlobal, needed here because
// the "appearance" tests below specifically exercise useThemePreference's persistence.
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

function renderSettingsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<div>Login stub</div>} />
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

// Every SettingsPage render fires at least two fetches on mount regardless of which section
// a given test cares about: AuthProvider's own session-rehydration POST to /api/auth/refresh,
// and ProfileSection's own GET to /api/users/me. A url-matching mockImplementation (the same
// pattern DashboardPage.test.tsx uses, for the same reason - see its comment) is what lets
// each test only specify the routes it actually cares about, regardless of the exact order
// React fires these mount effects in.
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
    for (const [key, respond] of Object.entries(overrides)) {
      const [method, path] = key.includes(" ") ? key.split(" ") : [undefined, key];
      if (url.includes(path) && (!method || init?.method === method)) {
        return Promise.resolve(respond(init));
      }
    }
    throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`);
  });
}

describe("SettingsPage — change password", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a new password meeting the strength rules, without calling the API", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/auth/change-password"))).toBe(
      false,
    );
  });

  it("requires the confirmation field to match the new password", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "Different1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/auth/change-password"))).toBe(
      false,
    );
  });

  it("changes the password, logs out, and redirects to login with a confirmation message", async () => {
    const fetchMock = routedFetchMock({
      "/api/auth/change-password": () => jsonResponse(200, { message: "Password updated" }),
      "/api/auth/logout": () => jsonResponse(200, { message: "Logged out" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewPass1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Login stub")).toBeInTheDocument();

    const changePasswordCall = fetchMock.mock.calls.find(([url]) =>
      url.includes("/api/auth/change-password"),
    );
    expect(changePasswordCall).toBeDefined();
    const [, requestInit] = changePasswordCall as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({ currentPassword: "Sup3rSecret", newPassword: "NewPass1234" });
  });

  it("shows a friendly error when the current password is wrong", async () => {
    const fetchMock = routedFetchMock({
      "/api/auth/change-password": () =>
        jsonResponse(401, {
          error: { message: "Current password is incorrect", code: "INVALID_CURRENT_PASSWORD" },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "WrongPassword1");
    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewPass1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});

describe("SettingsPage — profile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the current display name and timezone on mount", async () => {
    const fetchMock = routedFetchMock({
      "GET /api/users/me": () =>
        jsonResponse(200, {
          ...DEFAULT_PROFILE,
          displayName: "Jane Doe",
          timezone: "Europe/London",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByLabelText(/display name/i)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/timezone/i)).toHaveValue("Europe/London");
  });

  it("saves profile changes and shows a confirmation", async () => {
    const fetchMock = routedFetchMock({
      "PATCH /api/users/me": (init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        return jsonResponse(200, { ...DEFAULT_PROFILE, ...body });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    const nameField = await screen.findByLabelText(/display name/i);
    await user.clear(nameField);
    await user.type(nameField, "New Name");
    await user.selectOptions(screen.getByLabelText(/timezone/i), "America/Los_Angeles");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByText(/profile saved/i)).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => url.includes("/api/users/me") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const [, requestInit] = patchCall as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({ displayName: "New Name", timezone: "America/Los_Angeles" });
  });

  it("surfaces a validation error from the server without crashing the form", async () => {
    const fetchMock = routedFetchMock({
      "PATCH /api/users/me": () =>
        jsonResponse(400, {
          error: {
            message: "Invalid profile update",
            code: "VALIDATION_ERROR",
            details: { timezone: ["Not a recognized timezone"] },
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByText(/check the highlighted fields/i)).toBeInTheDocument();
  });
});

describe("SettingsPage — appearance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubWorkingLocalStorage();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to the System option selected, with no data-theme attribute forced", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("switches to Dark, persists it, and applies data-theme to the document", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("welltrack:theme")).toBe("dark");
  });
});

describe("SettingsPage — reminders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // vi.restoreAllMocks() only restores vi.spyOn-based mocks - these are plain vi.fn()s from
    // the top-level vi.mock() factory, which keep accumulating call history across tests
    // otherwise (there's no "original implementation" for restoreAllMocks to put back).
    vi.mocked(pushNotifications.isPushSupported).mockReset().mockReturnValue(true);
    vi.mocked(pushNotifications.subscribeToPush).mockReset().mockResolvedValue(undefined);
    vi.mocked(pushNotifications.unsubscribeFromPush).mockReset().mockResolvedValue(undefined);
  });

  // Every test in this block hits two fetches on mount (GET /api/reminders, /api/categories) in
  // addition to the two every SettingsPage render already fires - a small wrapper around
  // routedFetchMock so each test only has to specify what it actually cares about, the same
  // "sensible defaults, only override what matters" shape withAuthedUser already uses in the
  // categories describe block below.
  //
  // Deliberately NOT `routedFetchMock({ ...bareDefaults, ...overrides })` - routedFetchMock's own
  // matching loop returns on the *first* key whose path matches (see its own comment above), so a
  // bare (method-less) key intercepts every method for that path, GET included. Spreading bare
  // defaults first and a test's own overrides second still lets a genuinely new key (e.g. this
  // test's own "POST /api/reminders") end up positioned *after* an already-early bare default for
  // the same path - meaning that early bare default swallows the POST too, before the override is
  // ever reached (confirmed directly: this was a real, if short-lived, bug in this exact test file
  // - a create/edit/delete would silently hit the bare `[]` default instead of the intended
  // handler). Building the merged object from the *test's own overrides first*, then filling in a
  // bare default only for a path with no key of its own yet, keeps a test-supplied method-specific
  // key at its natural early position while still getting a working bare GET fallback for mount -
  // exactly the ordering every other describe block in this file already gets "for free" by simply
  // writing both keys directly, method-specific first, in one literal (see e.g. the categories
  // block's own "creates a new category" test) - this just automates supplying the bare default
  // half of that pattern, without disturbing the position of whatever a test explicitly wrote.
  function withReminders(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
    const merged: Record<string, (init?: RequestInit) => Response> = { ...overrides };
    const bareDefaults: Record<string, (init?: RequestInit) => Response> = {
      "/api/reminders": () => jsonResponse(200, []),
      "/api/categories": () => jsonResponse(200, []),
      "/api/push/vapid-public-key": () => jsonResponse(200, { publicKey: "test-public-key" }),
    };
    for (const [path, respond] of Object.entries(bareDefaults)) {
      if (!(path in merged)) merged[path] = respond;
    }
    return routedFetchMock(merged);
  }

  const generalReminder = {
    id: "rem-general",
    userId: "user-1",
    target: "general",
    categoryId: null,
    times: ["20:00"],
    enabled: true,
    createdAt: "2026-08-24T00:00:00.000Z",
    category: null,
  };
  const categoryReminder = {
    id: "rem-category",
    userId: "user-1",
    target: "category",
    categoryId: "cat-1",
    times: ["09:00", "15:00"],
    enabled: true,
    createdAt: "2026-08-24T00:00:00.000Z",
    category: { name: "Water intake", icon: "💧" },
  };
  const waterCategory = {
    id: "cat-1",
    userId: "user-1",
    name: "Water intake",
    icon: "💧",
    valueType: "numeric",
    scaleMin: null,
    scaleMax: null,
    archivedAt: null,
    createdAt: "2026-08-24T00:00:00.000Z",
  };

  it("shows an explanatory message instead of the list when push isn't supported", async () => {
    vi.mocked(pushNotifications.isPushSupported).mockReturnValue(false);
    const fetchMock = withReminders();
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    expect(screen.getByText(/can't receive notifications/i)).toBeInTheDocument();
    expect(screen.queryByText(/no reminders yet/i)).not.toBeInTheDocument();
  });

  it("shows 'No reminders yet' when the list is empty", async () => {
    const fetchMock = withReminders();
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByText(/no reminders yet/i)).toBeInTheDocument();
  });

  it("lists reminders with their resolved target label and times as chips", async () => {
    const fetchMock = withReminders({
      "/api/reminders": () => jsonResponse(200, [generalReminder, categoryReminder]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("💧 Water intake")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
  });

  it("creates a GENERAL reminder, subscribing to push since it's the account's first enabled reminder", async () => {
    const created = { ...generalReminder };
    const fetchMock = withReminders({
      "POST /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(201, { ...created, ...body });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText(/no reminders yet/i);
    await user.click(screen.getByRole("button", { name: "+ Add reminder" }));
    await user.click(screen.getByRole("radio", { name: /general/i }));
    await user.type(screen.getByLabelText(/^time 1$/i), "20:00");
    await user.click(screen.getByRole("button", { name: /create reminder/i }));

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(pushNotifications.subscribeToPush).toHaveBeenCalledWith("test-public-key");

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url.includes("/api/reminders") && init?.method === "POST",
    );
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ target: "general", times: ["20:00"] });
  });

  it("creates a CATEGORY reminder via the category sub-picker, with two independent times", async () => {
    const fetchMock = withReminders({
      "/api/categories": () => jsonResponse(200, [waterCategory]),
      "POST /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(201, { ...categoryReminder, ...body });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText(/no reminders yet/i);
    await user.click(screen.getByRole("button", { name: "+ Add reminder" }));
    await user.click(screen.getByRole("radio", { name: /a specific category/i }));
    // Scoped to the category sub-picker's own radiogroup - "A specific category"'s own hint text
    // also mentions "Water intake" as an example, so an unscoped match would be ambiguous.
    await user.click(
      within(screen.getByRole("radiogroup", { name: /which category/i })).getByRole("radio", {
        name: /water intake/i,
      }),
    );
    await user.type(screen.getByLabelText(/^time 1$/i), "09:00");
    await user.click(screen.getByRole("button", { name: /add another time/i }));
    await user.type(screen.getByLabelText(/^time 2$/i), "15:00");
    await user.click(screen.getByRole("button", { name: /create reminder/i }));

    // Scoped to the Reminders section itself - the same category also appears in
    // CategoriesSection further down the page (it independently fetches the same
    // /api/categories list this test provides for the create form's own sub-picker).
    const remindersContent = document.getElementById(
      "collapsible-section-settings.reminders-content",
    ) as HTMLElement;
    expect(await within(remindersContent).findByText("💧 Water intake")).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url.includes("/api/reminders") && init?.method === "POST",
    );
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ target: "category", categoryId: "cat-1", times: ["09:00", "15:00"] });
  });

  it("requires choosing a category before submitting a CATEGORY reminder", async () => {
    const fetchMock = withReminders({
      "/api/categories": () => jsonResponse(200, [waterCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText(/no reminders yet/i);
    await user.click(screen.getByRole("button", { name: "+ Add reminder" }));
    await user.click(screen.getByRole("radio", { name: /a specific category/i }));
    await user.type(screen.getByLabelText(/^time 1$/i), "10:00");
    await user.click(screen.getByRole("button", { name: /create reminder/i }));

    expect(await screen.findByText(/choose which category/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url.includes("/api/reminders") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("shows a specific message when notification permission is denied while creating", async () => {
    vi.mocked(pushNotifications.subscribeToPush).mockRejectedValue(
      new pushNotifications.PushPermissionDeniedError(),
    );
    const fetchMock = withReminders();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText(/no reminders yet/i);
    await user.click(screen.getByRole("button", { name: "+ Add reminder" }));
    await user.click(screen.getByRole("radio", { name: /general/i }));
    await user.type(screen.getByLabelText(/^time 1$/i), "20:00");
    await user.click(screen.getByRole("button", { name: /create reminder/i }));

    expect(await screen.findByText(/notifications were blocked/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url.includes("/api/reminders") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("toggling the only enabled reminder off unsubscribes from push", async () => {
    const fetchMock = withReminders({
      "PATCH /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...generalReminder, ...body });
      },
      "/api/reminders": () => jsonResponse(200, [generalReminder]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText("General");
    await user.click(screen.getByLabelText(/^enabled$/i));

    await vi.waitFor(() => expect(pushNotifications.unsubscribeFromPush).toHaveBeenCalledOnce());
    expect(pushNotifications.subscribeToPush).not.toHaveBeenCalled();
  });

  it("toggling a disabled reminder back on subscribes to push again", async () => {
    const disabled = { ...generalReminder, enabled: false };
    const fetchMock = withReminders({
      "PATCH /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...disabled, ...body });
      },
      "/api/reminders": () => jsonResponse(200, [disabled]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText("General");
    await user.click(screen.getByLabelText(/^enabled$/i));

    await vi.waitFor(() =>
      expect(pushNotifications.subscribeToPush).toHaveBeenCalledWith("test-public-key"),
    );
    expect(pushNotifications.unsubscribeFromPush).not.toHaveBeenCalled();
  });

  it("edits a reminder's times", async () => {
    const fetchMock = withReminders({
      "PATCH /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...generalReminder, ...body });
      },
      "/api/reminders": () => jsonResponse(200, [generalReminder]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText("General");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const timeField = screen.getByLabelText(/^time 1$/i);
    await user.clear(timeField);
    await user.type(timeField, "18:00");
    const editRow = timeField.closest("li") as HTMLElement;
    await user.click(within(editRow).getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("18:00")).toBeInTheDocument();
  });

  it("deletes the only enabled reminder, unsubscribing from push", async () => {
    const fetchMock = withReminders({
      "DELETE /api/reminders": () => jsonResponse(200, { message: "Deleted" }),
      "/api/reminders": () => jsonResponse(200, [generalReminder]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettingsPage();

    await screen.findByText("General");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/no reminders yet/i)).toBeInTheDocument();
    await vi.waitFor(() => expect(pushNotifications.unsubscribeFromPush).toHaveBeenCalledOnce());
  });

  it("shows an inline note when a CATEGORY reminder's category has been archived", async () => {
    const disabledArchived = { ...categoryReminder, enabled: false };
    const fetchMock = withReminders({
      "/api/reminders": () => jsonResponse(200, [disabledArchived]),
      // The category itself is gone from GET /api/categories - archived categories are excluded
      // from that list by default (see categories.ts), which is exactly the signal used to tell
      // "archived" apart from "just manually turned off."
      "/api/categories": () => jsonResponse(200, []),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    expect(await screen.findByText("💧 Water intake")).toBeInTheDocument();
    expect(screen.getByText(/this category has been archived/i)).toBeInTheDocument();
  });
});

describe("SettingsPage — categories", () => {
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
    renderSettingsPage();

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
    renderSettingsPage();

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
    renderSettingsPage();

    expect(await screen.findByText(/water intake/i)).toBeInTheDocument();
    expect(screen.getByText(/sleep hours/i)).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();

    // Only the user's own category gets Edit/Archive actions - the system one has none.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(1);
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
    renderSettingsPage();

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
    renderSettingsPage();

    await screen.findByText(/water intake/i);
    await user.click(screen.getByRole("button", { name: "Edit" }));
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

  it("archives the user's own category (not a hard delete) and removes it from the list", async () => {
    const fetchMock = withAuthedUser({
      "DELETE /api/categories": () =>
        jsonResponse(200, { ...ownCategory, archivedAt: "2026-08-23T12:00:00.000Z" }),
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettingsPage();

    await screen.findByText(/water intake/i);
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText(/category archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/water intake/i)).not.toBeInTheDocument();
  });

  it("never shows Edit/Archive for a system category", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [systemCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    await screen.findByText(/sleep hours/i);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
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
    renderSettingsPage();

    await screen.findByText(/sleep hours/i);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(await screen.findByText("Hidden")).toBeInTheDocument();
    expect(await screen.findByText(/category hidden/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unhide" })).toBeInTheDocument();
  });

  it("unhides an already-hidden system category", async () => {
    const fetchMock = withAuthedUser({
      "DELETE /api/categories/cat-system/hide": () =>
        jsonResponse(200, { message: "Category unhidden" }),
      "/api/categories": () => jsonResponse(200, [{ ...systemCategory, hidden: true }]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByText("Hidden");
    await user.click(screen.getByRole("button", { name: "Unhide" }));

    expect(await screen.findByText(/category unhidden/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("never offers Hide/Unhide for the user's own category", async () => {
    const fetchMock = withAuthedUser({
      "/api/categories": () => jsonResponse(200, [ownCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettingsPage();

    await screen.findByText(/water intake/i);
    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unhide" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — export data", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the export as a file using the server-suggested filename", async () => {
    const exportBody = JSON.stringify({ user: DEFAULT_PROFILE, categoryLogs: [] });
    const fetchMock = routedFetchMock({
      "/api/export": () =>
        new Response(exportBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="welltrack-export-2026-08-19.json"',
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL, and clicking a real <a> whose
    // href it doesn't recognize as navigable logs a noisy "not implemented" navigation error -
    // both stubbed out (as plain property assignments, not vi.stubGlobal, so URL itself stays a
    // real constructor - only its two static methods are swapped) so this test exercises exactly
    // the download-triggering call sequence ExportDataSection makes, without depending on jsdom
    // features it doesn't have.
    const createObjectURL = vi.fn((_blob: Blob) => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      const user = userEvent.setup();
      renderSettingsPage();

      await screen.findByLabelText(/display name/i);
      await user.click(screen.getByRole("button", { name: /download my data/i }));

      await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

      const exportCall = fetchMock.mock.calls.find(([url]) => url.includes("/api/export"));
      expect(exportCall).toBeDefined();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const [blobArg] = createObjectURL.mock.calls[0];
      expect(await (blobArg as Blob).text()).toBe(exportBody);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it("shows an error if the export request fails", async () => {
    const fetchMock = routedFetchMock({
      "/api/export": () =>
        jsonResponse(500, { error: { message: "Something broke", code: "INTERNAL_ERROR" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.click(screen.getByRole("button", { name: /download my data/i }));

    expect(
      await screen.findByText(/something went wrong exporting your data/i),
    ).toBeInTheDocument();
  });
});

describe("SettingsPage — account deletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the delete button disabled until DELETE is typed exactly", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    const deleteButton = screen.getByRole("button", { name: /permanently delete my account/i });
    const confirmField = screen.getByLabelText(/type delete to confirm/i);

    expect(deleteButton).toBeDisabled();

    await user.type(confirmField, "delete");
    expect(deleteButton).toBeDisabled();

    await user.clear(confirmField);
    await user.type(confirmField, "DELETE");
    expect(deleteButton).toBeEnabled();

    // Critically, nothing before typing the full confirmation phrase ever reached the delete
    // endpoint - the gate isn't just a disabled button, it's also never bypassed by mistake.
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url.includes("/api/users/me") && init?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("deletes the account, logs out, and redirects to login with a confirmation message", async () => {
    const fetchMock = routedFetchMock({
      "DELETE /api/users/me": () => jsonResponse(200, { message: "Account deleted" }),
      "/api/auth/logout": () => jsonResponse(200, { message: "Logged out" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /permanently delete my account/i }));

    expect(await screen.findByText("Login stub")).toBeInTheDocument();

    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) => url.includes("/api/users/me") && init?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });

  it("shows an error and does not navigate away when deletion fails", async () => {
    const fetchMock = routedFetchMock({
      "DELETE /api/users/me": () =>
        jsonResponse(500, { error: { message: "Something broke", code: "INTERNAL_ERROR" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /permanently delete my account/i }));

    expect(
      await screen.findByText(/something went wrong deleting your account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Login stub")).not.toBeInTheDocument();
  });
});

describe("SettingsPage — collapsible sections", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses each of the three sections independently via its own toggle", async () => {
    const fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await screen.findByLabelText(/display name/i);
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/type delete to confirm/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^profile$/i }));

    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    // The other two sections are untouched by collapsing Profile.
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/type delete to confirm/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete account/i }));

    expect(screen.queryByLabelText(/type delete to confirm/i)).not.toBeInTheDocument();
    // Change password is still untouched by collapsing Delete account.
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });
});

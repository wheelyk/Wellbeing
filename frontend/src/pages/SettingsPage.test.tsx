import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { SettingsPage } from "./SettingsPage";
import * as pushNotifications from "../lib/pushNotifications";
import { DASHBOARD_ENTRY_CHANGED_EVENT } from "../lib/dashboardEntryChangedEvent";

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

// A save/delete anywhere Timeline's data depends on should announce it the same way a category
// log or task save already does (see dashboardEntryChangedEvent.ts and CategoriesPage.test.tsx's
// own identical helper) - counted directly rather than mounting Timeline itself to observe a
// refetch.
function captureEntryChanged(): { count: () => number } {
  let count = 0;
  const handler = () => {
    count += 1;
  };
  window.addEventListener(DASHBOARD_ENTRY_CHANGED_EVENT, handler);
  return { count: () => count };
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
    // CategoriesSection fetches this alongside /api/categories on every mount (see
    // docs/log/23-category-groups.md) - defaulted to empty here so every pre-existing test that
    // exercises that section doesn't need to know about groups at all unless it specifically
    // cares, the same "auto-handle, override only when needed" convention as the two cases above.
    if (url.includes("/api/category-groups") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(overrides["/api/category-groups"]?.(init) ?? jsonResponse(200, []));
    }
    // apiFetch never sets init.method for a plain GET (see api/client.ts), so a "GET /api/x"
    // override key can never match through the generic loop below - matched explicitly here,
    // the same way the routes above already are. POST/PATCH/DELETE still fall through.
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

  // Since per-category reminders moved onto the Categories page, this section only ever deals
  // with the general one plus the device push permission (see
  // docs/log/26-categories-page-and-reminder-picker.md).
  function withReminders(
    reminders: unknown[],
    overrides: Record<string, (init?: RequestInit) => Response> = {},
  ) {
    return routedFetchMock({
      "GET /api/reminders": () => jsonResponse(200, reminders),
      "/api/push/vapid-public-key": () => jsonResponse(200, { publicKey: "test-key" }),
      ...overrides,
    });
  }

  const generalReminder = {
    id: "rem-general",
    userId: "user-1",
    target: "general",
    categoryId: null,
    category: null,
    schedules: ["0 21 * * *"],
    enabled: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  };

  it("describes an existing general reminder's schedule in plain words", async () => {
    vi.stubGlobal("fetch", withReminders([generalReminder]));
    renderSettingsPage();

    expect(await screen.findByText("21:00 daily")).toBeInTheDocument();
  });

  it("points at the Categories page rather than listing per-category reminders", async () => {
    vi.stubGlobal("fetch", withReminders([generalReminder]));
    renderSettingsPage();

    await screen.findByText("21:00 daily");
    // Scoped to the reminders card - the nav bars now carry a Categories link of their own, so a
    // bare role query would be ambiguous and would pass even if this pointer were missing.
    const remindersCard = screen
      .getByText("General reminder")
      .closest("div.rounded-2xl") as HTMLElement;
    expect(within(remindersCard).getByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/categories",
    );
  });

  it("shows the general reminder as off when there isn't one, and offers to set it up", async () => {
    vi.stubGlobal("fetch", withReminders([]));
    renderSettingsPage();

    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
  });

  it("creates the general reminder from the schedule picker, subscribing to push first", async () => {
    const created = { ...generalReminder, schedules: ["0 20 * * *"] };
    const fetchMock = withReminders([], {
      "POST /api/reminders": () => jsonResponse(201, created),
    });
    vi.stubGlobal("fetch", fetchMock);
    const entryChanged = captureEntryChanged();
    const user = userEvent.setup();
    renderSettingsPage();

    await user.click(await screen.findByRole("button", { name: "Set up" }));
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    expect(await screen.findByText("20:00 daily")).toBeInTheDocument();
    // Timeline's own row for tonight didn't exist until this reminder did - it needs to know.
    expect(entryChanged.count()).toBe(1);
    // Push has to be subscribed before the first enabled reminder exists, or nothing can be
    // delivered to this device at all.
    expect(pushNotifications.subscribeToPush).toHaveBeenCalledWith("test-key");

    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/api/reminders") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    const body = JSON.parse((post?.[1] as RequestInit | undefined)?.body as string);
    expect(body).toMatchObject({ target: "general" });
  });

  it("sends cron built from the picker's own controls when the schedule is changed", async () => {
    const fetchMock = withReminders([generalReminder], {
      "PATCH /api/reminders": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...generalReminder, ...body });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Weekdays" }));
    await user.click(screen.getByRole("button", { name: "Save reminder" }));

    // The picker generates the expression; the day chips are just a view of it.
    expect(await screen.findByText("21:00 weekdays")).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    const body = JSON.parse((patch?.[1] as RequestInit | undefined)?.body as string);
    expect(body.schedules).toEqual(["0 21 * * 1-5"]);
  });

  it("turns the general reminder off, unsubscribing from push", async () => {
    const fetchMock = withReminders([generalReminder], {
      "DELETE /api/reminders": () => jsonResponse(200, { message: "Deleted" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const entryChanged = captureEntryChanged();
    const user = userEvent.setup();
    renderSettingsPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(pushNotifications.unsubscribeFromPush).toHaveBeenCalled();
    // Timeline's own row for tonight is gone now too - it needs to know.
    expect(entryChanged.count()).toBe(1);
  });

  it("explains that this browser can't receive notifications at all", async () => {
    vi.mocked(pushNotifications.isPushSupported).mockReturnValue(false);
    vi.stubGlobal("fetch", withReminders([]));
    renderSettingsPage();

    expect(await screen.findByText(/can.t receive notifications/i)).toBeInTheDocument();
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { SettingsPage } from "./SettingsPage";

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

describe("SettingsPage — export data", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the export as a file using the server-suggested filename", async () => {
    const exportBody = JSON.stringify({ user: DEFAULT_PROFILE, moodLogs: [] });
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

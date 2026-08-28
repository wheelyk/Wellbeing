import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { AdminCategoriesPage } from "./AdminCategoriesPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// NavBar (rendered by AdminCategoriesPage itself) calls useAuth internally, and useAuth needs
// an AuthProvider ancestor - this page is only ever reached already nested inside one via
// App.tsx's real route tree, so the test has to provide the same context. Each test's own
// fetchMock below answers every URL the same way, including AuthProvider's own mount-time
// /api/auth/refresh call - harmless here, since rehydrateSession treats a malformed/error
// response the same as "no session," and this page's own behavior doesn't depend on who (if
// anyone) is logged in; only RequireAdmin (a layer above it, not under test here) does.
function renderAdminPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AdminCategoriesPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

// The page now fires two independent fetches on mount (categories, then category-groups - see
// docs/log/24-admin-group-assignment-and-backfill.md), so a single blanket
// `mockResolvedValue(...)` answering every request identically no longer works once a test cares
// about what either one actually returns. A url-matching mock (the same pattern
// SettingsPage.test.tsx's own routedFetchMock already established, for the identical reason) lets
// each test specify only the routes it cares about; anything unspecified defaults to an empty
// array so existing category-only tests don't also need to know about groups.
function routedFetchMock(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/api/auth/refresh")) {
      return Promise.resolve(
        overrides["/api/auth/refresh"]?.(init) ??
          jsonResponse(401, { error: { message: "no refresh cookie" } }),
      );
    }
    // apiFetch never sets `init.method` at all for a plain GET (see api/client.ts) - matched here
    // directly, the same way SettingsPage.test.tsx's own routedFetchMock special-cases its own
    // GET routes, rather than through the generic loop below, whose own method check
    // (`init?.method === method`) can never be satisfied by an undefined actual method.
    if (url.includes("/api/category-groups") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(
        overrides["GET /api/category-groups"]?.(init) ?? jsonResponse(200, []),
      );
    }
    if (url.includes("/api/admin/categories") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(
        overrides["GET /api/admin/categories"]?.(init) ?? jsonResponse(200, []),
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
  groupId: null,
};

const medicineGroup = {
  id: "group-medicine",
  userId: null,
  name: "Medicine",
  icon: "💊",
  hidden: false,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("AdminCategoriesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists global categories", async () => {
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, [systemCategory]),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAdminPage();

    expect(await screen.findByText(/sleep hours/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/categories"),
      expect.anything(),
    );
  });

  it("shows an empty state when there are no global categories yet", async () => {
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, []),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAdminPage();

    expect(await screen.findByText(/no global categories yet/i)).toBeInTheDocument();
  });

  it("creates a new global category via the admin endpoint", async () => {
    const createdCategory = {
      id: "cat-new",
      userId: null,
      name: "Screen time",
      icon: null,
      valueType: "duration",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      groupId: null,
    };
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, []),
      "POST /api/admin/categories": () => jsonResponse(201, createdCategory),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderAdminPage();
    await screen.findByText(/no global categories yet/i);
    await user.click(screen.getByRole("button", { name: "+ New global category" }));
    await user.type(screen.getByLabelText(/category name/i), "Screen time");
    await user.click(screen.getByRole("radio", { name: /duration/i }));
    await user.click(screen.getByRole("button", { name: /create category/i }));

    expect(await screen.findByText(/screen time/i)).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(
      (call) =>
        (call[1] as RequestInit | undefined)?.method === "POST" &&
        String(call[0]).includes("/api/admin/categories"),
    );
    expect(postCall).toBeDefined();
  });

  it("offers the group picker when creating a global category, and sends the chosen groupId", async () => {
    const createdCategory = {
      id: "cat-new",
      userId: null,
      name: "Paracetamol",
      icon: null,
      valueType: "boolean",
      scaleMin: null,
      scaleMax: null,
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      groupId: medicineGroup.id,
    };
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, []),
      "GET /api/category-groups": () => jsonResponse(200, [medicineGroup]),
      "POST /api/admin/categories": () => jsonResponse(201, createdCategory),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderAdminPage();
    await screen.findByText(/no global categories yet/i);
    await user.click(screen.getByRole("button", { name: "+ New global category" }));
    await user.type(screen.getByLabelText(/category name/i), "Paracetamol");
    await user.click(screen.getByRole("radio", { name: /yes \/ no/i }));
    await user.selectOptions(screen.getByLabelText(/group \(optional\)/i), "💊 Medicine");
    await user.click(screen.getByRole("button", { name: /create category/i }));

    await screen.findByText(/paracetamol/i);
    const postCall = fetchMock.mock.calls.find(
      (call) =>
        (call[1] as RequestInit | undefined)?.method === "POST" &&
        String(call[0]).includes("/api/admin/categories"),
    );
    const body = JSON.parse((postCall?.[1] as RequestInit | undefined)?.body as string);
    expect(body.groupId).toBe(medicineGroup.id);
  });

  it("shows a category's assigned group as a tag, and lets the admin reassign it", async () => {
    const grouped = { ...systemCategory, groupId: medicineGroup.id };
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, [grouped]),
      "GET /api/category-groups": () => jsonResponse(200, [medicineGroup]),
      "PATCH /api/admin/categories": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...grouped, ...body });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderAdminPage();
    expect(await screen.findByText("💊 Medicine")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText(/^group$/i), "");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await screen.findByText(/sleep hours/i);
    expect(screen.queryByText("💊 Medicine")).not.toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(
      (call) =>
        (call[1] as RequestInit | undefined)?.method === "PATCH" &&
        String(call[0]).includes("/api/admin/categories"),
    );
    const body = JSON.parse((patchCall?.[1] as RequestInit | undefined)?.body as string);
    expect(body.groupId).toBeNull();
  });

  it("edits and archives a global category", async () => {
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(200, [systemCategory]),
      "PATCH /api/admin/categories": (init) => {
        const body = JSON.parse(init?.body as string);
        return jsonResponse(200, { ...systemCategory, ...body });
      },
      "DELETE /api/admin/categories": () =>
        jsonResponse(200, { ...systemCategory, archivedAt: "2026-08-23T12:00:00.000Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderAdminPage();
    await screen.findByText(/sleep hours/i);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByLabelText(/^name$/i);
    await user.clear(nameField);
    await user.type(nameField, "Sleep duration");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/sleep duration/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText(/category archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/sleep duration/i)).not.toBeInTheDocument();
  });

  it("shows an error state when the list fails to load", async () => {
    const fetchMock = routedFetchMock({
      "GET /api/admin/categories": () => jsonResponse(500, { error: { message: "Oops" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAdminPage();

    expect(await screen.findByText(/couldn't load global categories/i)).toBeInTheDocument();
  });
});

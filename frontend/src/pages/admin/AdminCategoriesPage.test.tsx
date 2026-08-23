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

describe("AdminCategoriesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists global categories", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [systemCategory]));
    vi.stubGlobal("fetch", fetchMock);

    renderAdminPage();

    expect(await screen.findByText(/sleep hours/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/categories"),
      expect.anything(),
    );
  });

  it("shows an empty state when there are no global categories yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
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
    };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse(201, createdCategory));
      return Promise.resolve(jsonResponse(200, []));
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

  it("edits and archives a global category", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        return Promise.resolve(jsonResponse(200, { ...systemCategory, ...body }));
      }
      if (init?.method === "DELETE") {
        return Promise.resolve(
          jsonResponse(200, { ...systemCategory, archivedAt: "2026-08-23T12:00:00.000Z" }),
        );
      }
      return Promise.resolve(jsonResponse(200, [systemCategory]));
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Oops" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderAdminPage();

    expect(await screen.findByText(/couldn't load global categories/i)).toBeInTheDocument();
  });
});

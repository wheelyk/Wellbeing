import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { RequireAdmin } from "./RequireAdmin";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function baseUser(isAdmin: boolean) {
  return {
    id: "1",
    email: "user@example.com",
    displayName: "User",
    timezone: "UTC",
    createdAt: "2026-01-01T00:00:00.000Z",
    isAdmin,
  };
}

function renderGuardedApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/admin/categories"]}>
        <Routes>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireAdmin />}>
              <Route path="/admin/categories" element={<p>Admin categories</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("RequireAdmin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the admin route for the account whose isAdmin is true", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { user: baseUser(true), accessToken: "t" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderGuardedApp();

    expect(await screen.findByText("Admin categories")).toBeInTheDocument();
  });

  it("redirects a non-admin authenticated user to /dashboard, not /login", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { user: baseUser(false), accessToken: "t" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderGuardedApp();

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Admin categories")).not.toBeInTheDocument();
  });
});

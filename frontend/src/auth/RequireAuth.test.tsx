import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { apiFetch } from "../api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function LoginButton() {
  const { login } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await login({ email: "user@example.com", password: "Sup3rSecret" });
        navigate("/dashboard");
      }}
    >
      Log in
    </button>
  );
}

function DashboardWithApiCall() {
  return (
    <div>
      <p>Dashboard</p>
      <button onClick={() => apiFetch("/api/protected").catch(() => {})}>
        Load protected data
      </button>
    </div>
  );
}

function renderGuardedApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<LoginButton />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardWithApiCall />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects an unauthenticated visitor to /login instead of rendering the route", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderGuardedApp();

    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders the protected route once the user is actually authenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: {
          id: "1",
          email: "user@example.com",
          displayName: "User",
          timezone: "UTC",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        accessToken: "token-xyz",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderGuardedApp();

    // Starts on /login (the guard redirected here, as in the previous test).
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
  });

  it("redirects to /login if a background request's token refresh fails", async () => {
    const fetchMock = vi
      .fn()
      // Login succeeds.
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: {
            id: "1",
            email: "user@example.com",
            displayName: "User",
            timezone: "UTC",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          accessToken: "token-xyz",
        }),
      )
      // The protected call comes back 401 (token expired while the user was on the page).
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "expired" } }))
      // The refresh attempt also fails (refresh cookie itself expired/revoked).
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "invalid refresh" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderGuardedApp();

    await user.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /load protected data/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});

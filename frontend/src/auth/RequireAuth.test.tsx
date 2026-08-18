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

  it("lands directly on the protected route on a fresh mount when a valid session cookie exists - never showing /login", async () => {
    // Simulates a browser refresh: AuthProvider's own React state has just been rebuilt from
    // nothing (starts as if logged out), but a real, still-valid refresh cookie exists - the
    // exact scenario that previously always showed Login even for a genuinely valid session.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
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
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderGuardedApp();

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log in/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/refresh"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("redirects an unauthenticated visitor to /login instead of rendering the route", async () => {
    // A plain vi.fn() with no implementation: AuthProvider's mount-time rehydration attempt
    // gets back `undefined` from fetch() rather than a real Response, which rehydrateSession's
    // own try/catch treats the same as any other failed attempt - no session, same as a real
    // browser with no refresh cookie at all.
    vi.stubGlobal("fetch", vi.fn());
    renderGuardedApp();

    // Async now: RequireAuth renders nothing while AuthProvider's mount-time rehydration
    // attempt is still in flight, only redirecting once it resolves - see RequireAuth.tsx.
    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders the protected route once the user is actually authenticated", async () => {
    const fetchMock = vi
      .fn()
      // AuthProvider's mount-time rehydration attempt - no real session cookie in this test,
      // so it fails, same as a real fresh browser with nothing logged in yet.
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "no refresh cookie" } }))
      .mockImplementation(() =>
        Promise.resolve(
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
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderGuardedApp();

    // Starts on /login (the guard redirected here, once its own mount-time async check
    // resolves - same reasoning as the previous test's `findByRole`).
    await user.click(await screen.findByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
  });

  it("redirects to /login if a background request's token refresh fails", async () => {
    const fetchMock = vi
      .fn()
      // AuthProvider's mount-time rehydration attempt - no real session cookie in this test.
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "no refresh cookie" } }))
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

    await user.click(await screen.findByRole("button", { name: /log in/i }));
    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /load protected data/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});

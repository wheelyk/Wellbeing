import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { NavBar } from "./NavBar";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// NavBar reads the current user from AuthContext, which only ever gets populated via a real
// login or - as used here - the mount-time session-rehydration call every AuthProvider makes
// (see auth/AuthContext.tsx). Mocking that one call is the established way other tests in this
// project get a real `user` into context without duplicating AuthProvider's own login logic.
function renderNavBarAsUser(displayName: string) {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      jsonResponse(200, {
        user: {
          id: "1",
          email: "user@example.com",
          displayName,
          timezone: "UTC",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        accessToken: "token-xyz",
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <NavBar />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("NavBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every nav link and the Log out button", async () => {
    renderNavBarAsUser("Regular Name");

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trends" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("Regular Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("hides the display name below the sm breakpoint and truncates it above", async () => {
    // jsdom (this test's rendering environment) has no real layout engine and doesn't load the
    // compiled Tailwind stylesheet, so it can't compute actual visibility or overflow from
    // `hidden`/`sm:block`/`truncate` - that was confirmed directly in a real browser at a 375px
    // viewport (see docs/log/... entry for this fix). This test is a structural regression
    // guard: it fails loudly if a future edit removes any of these classes (or the `min-w-0`
    // truncate depends on to take effect at all inside a flex row) without anyone noticing.
    const longName = "a-very-long-display-name-that-would-overflow-a-narrow-mobile-header";
    renderNavBarAsUser(longName);

    const nameSpan = await screen.findByText(longName);
    expect(nameSpan.className).toContain("hidden");
    expect(nameSpan.className).toContain("sm:block");
    expect(nameSpan.className).toContain("truncate");
    expect(nameSpan.className).toContain("min-w-0");

    // The Log out button must stay fully intact, clickable, and never hidden regardless of name
    // length or viewport width - only the name should ever disappear/shrink.
    const logoutButton = screen.getByRole("button", { name: "Log out" });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton.className).not.toContain("hidden");
  });
});

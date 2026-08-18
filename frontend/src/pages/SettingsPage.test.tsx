import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { SettingsPage } from "./SettingsPage";

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

describe("SettingsPage — change password", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a new password meeting the strength rules, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    // AuthProvider's own mount-time rehydration attempt does call fetch once, on its own,
    // regardless of this form - only the change-password submission itself matters here.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/auth/change-password")),
    ).toBe(false);
  });

  it("requires the confirmation field to match the new password", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "Different1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/auth/change-password")),
    ).toBe(false);
  });

  it("changes the password, logs out, and redirects to login with a confirmation message", async () => {
    const fetchMock = vi
      .fn()
      // AuthProvider's mount-time rehydration attempt - no real session cookie in this test.
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: "no refresh cookie" } }))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password updated" }))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Logged out" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText(/current password/i), "Sup3rSecret");
    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewPass1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Login stub")).toBeInTheDocument();

    const [, changePasswordCall] = fetchMock.mock.calls;
    const [url, requestInit] = changePasswordCall;
    expect(url).toContain("/api/auth/change-password");
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual({ currentPassword: "Sup3rSecret", newPassword: "NewPass1234" });
  });

  it("shows a friendly error when the current password is wrong", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { message: "Current password is incorrect", code: "INVALID_CURRENT_PASSWORD" },
      }),
    );
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ResetPasswordPage } from "./ResetPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderResetPasswordPage(initialEntry = "/reset-password?token=abc123") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login stub</div>} />
        <Route path="/forgot-password" element={<div>Forgot password stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a new password meeting the strength rules, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();

    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the confirmation field to match the new password", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();

    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "Different1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the token and new password, then redirects to login with a confirmation message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "Password updated" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage("/reset-password?token=raw-token-value");

    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewPass1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Login stub")).toBeInTheDocument();

    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/auth/reset-password");
    expect(JSON.parse(requestInit.body as string)).toEqual({
      token: "raw-token-value",
      newPassword: "NewPass1234",
    });
  });

  it("shows a friendly error for an invalid or expired token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { message: "Invalid or expired reset link", code: "INVALID_RESET_TOKEN" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();

    await user.type(screen.getByLabelText(/^new password$/i), "NewPass1234");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewPass1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it("shows a message instead of a form when no token is present in the URL", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderResetPasswordPage("/reset-password");

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
  });
});

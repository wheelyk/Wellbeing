import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderForgotPasswordPage() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div>Login stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the email and shows the generic success message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        message: "If that email is registered, a reset link has been sent.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      await screen.findByText(/if that email is registered, a reset link has been sent/i),
    ).toBeInTheDocument();

    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/auth/forgot-password");
    expect(JSON.parse(requestInit.body as string)).toEqual({ email: "user@example.com" });
  });

  it("shows the same generic success message even when the email has no matching account", async () => {
    // The backend always returns the same 200 response regardless of whether the account
    // exists - this test exercises that the page shows the identical message either way,
    // rather than branching on some hidden signal the backend deliberately doesn't send.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        message: "If that email is registered, a reset link has been sent.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText(/email/i), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      await screen.findByText(/if that email is registered, a reset link has been sent/i),
    ).toBeInTheDocument();
  });

  it("shows a friendly error when the email format is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { message: "Invalid forgot-password request", code: "VALIDATION_ERROR" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
  });

  it("links back to the login page", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderForgotPasswordPage();

    expect(screen.getByRole("link", { name: /back to log in/i })).toHaveAttribute("href", "/login");
  });
});

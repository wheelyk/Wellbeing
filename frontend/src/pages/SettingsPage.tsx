import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../api/client";
import { NavBar } from "../components/NavBar";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { Card } from "../components/Card";

export function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!currentPassword) {
      errors.currentPassword = "Enter your current password.";
    }
    if (newPassword.length < 8) {
      errors.newPassword = "New password must be at least 8 characters.";
    } else if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      errors.newPassword = "New password must contain at least one letter and one number.";
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = "Passwords don't match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // Navigate away from this (RequireAuth-guarded) route *before* clearing auth state.
      // Doing it in the other order lets RequireAuth notice isAuthenticated flip to false
      // while still rendering /settings and fire its own redirect-to-login (with its own
      // `state: { from }`), racing this navigate call and overwriting its message - which is
      // exactly what happened when this was written the other way around and tested for real.
      navigate("/login", {
        replace: true,
        state: { message: "Password updated. Please log in again." },
      });
      // The backend already cleared the refresh cookie on success - logout() here just
      // brings the frontend's own state in line with that.
      await logout();
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_CURRENT_PASSWORD") {
        setFormError("Current password is incorrect.");
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setFormError("Please check the highlighted fields.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">Settings</h1>

        <section className="mt-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text">Change password</h2>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={fieldErrors.currentPassword}
                autoComplete="current-password"
                required
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={fieldErrors.newPassword}
                autoComplete="new-password"
                required
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={fieldErrors.confirmPassword}
                autoComplete="new-password"
                required
              />
              {formError && (
                <p role="alert" className="text-sm text-danger">
                  {formError}
                </p>
              )}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </Card>
        </section>
      </main>
    </div>
  );
}

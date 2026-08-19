import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../api/client";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { Card } from "../components/Card";

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
}

// A deliberately short, curated list rather than the full ~400-zone IANA database
// (`Intl.supportedValuesOf("timeZone")` would work too, but a dropdown with hundreds of
// options is its own usability problem) - one common zone per US timezone plus a handful of
// major world cities, enough for the overwhelming majority of users without building a
// fancier searchable picker that this task doesn't call for.
const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const DELETE_CONFIRMATION_PHRASE = "DELETE";

function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserProfile>("/api/users/me")
      .then((profile) => {
        if (cancelled) return;
        setDisplayName(profile.displayName);
        setTimezone(profile.timezone);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!displayName.trim()) {
      errors.displayName = "Display name can't be empty.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const profile = await apiFetch<UserProfile>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: displayName.trim(), timezone }),
      });
      setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setFormError("Please check the highlighted fields.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // The timezone this account is currently set to might not be one of the curated options
  // above (e.g. a less common zone) - appending it keeps the <select> from silently jumping
  // to whatever option happens to be first, which would misrepresent the saved value.
  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  if (loading) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-text">Profile</h2>
        <p className="text-sm text-text-muted">Loading…</p>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-text">Profile</h2>
        <p role="alert" className="text-sm text-danger">
          Couldn't load your profile. Please refresh the page.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-text">Profile</h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors.displayName}
          required
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="timezone-select" className="text-sm font-medium text-text">
            Timezone
          </label>
          <select
            id="timezone-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="rounded-lg border border-border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        {saved && !formError && (
          <p role="status" className="text-sm text-success">
            Profile saved.
          </p>
        )}
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}

function AccountDeletionSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmationText, setConfirmationText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = confirmationText.trim() === DELETE_CONFIRMATION_PHRASE;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiFetch("/api/users/me", { method: "DELETE" });
      // Same ordering as the change-password flow above, and for the same reason: navigate
      // away from this RequireAuth-guarded route before clearing auth state, so RequireAuth
      // doesn't fire its own competing redirect with its own `state`.
      navigate("/login", {
        replace: true,
        state: { message: "Your account has been deleted." },
      });
      await logout();
    } catch {
      setDeleteError("Something went wrong deleting your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold text-text">Delete account</h2>
      <p className="mb-4 text-sm text-text-muted">
        This permanently deletes your account and every symptom, mood, medication, and habit entry
        you've logged. This can't be undone.
      </p>
      <div className="flex flex-col gap-4">
        <TextField
          label={`Type ${DELETE_CONFIRMATION_PHRASE} to confirm`}
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          autoComplete="off"
        />
        {deleteError && (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        )}
        <Button
          type="button"
          variant="danger"
          onClick={handleDelete}
          disabled={!canDelete || deleting}
          className="self-start"
        >
          {deleting ? "Deleting…" : "Permanently delete my account"}
        </Button>
      </div>
    </Card>
  );
}

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
      {/* pb-24/md:pb-8 - see DashboardPage.tsx's equivalent comment: leaves room below `md:` for
          the fixed BottomNav bar so the Update password button isn't hidden behind it. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:pb-8">
        <h1 className="text-2xl font-semibold text-text">Settings</h1>

        <section className="mt-6">
          <ProfileSection />
        </section>

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

        <section className="mt-6">
          <AccountDeletionSection />
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

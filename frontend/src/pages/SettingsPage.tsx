import { useEffect, useState, type FormEvent, type HTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchFile, ApiError } from "../api/client";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { useThemePreference, type ThemePreference } from "../hooks/useThemePreference";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  PushPermissionDeniedError,
} from "../lib/pushNotifications";

// Mirrors Card.tsx's own visual styling (rounded-2xl border, surface background, shadow) but
// widens the column instead of Card's `max-w-sm` default - a 2026-08-19 design review found
// Settings pinning itself to a 384px column even on a wide desktop screen, unlike
// Dashboard/Trends (see docs/log/13-responsive-design.md), so this page now widens up to a
// comfortably-readable ~672px single column instead (`max-w-2xl` below), centered via mx-auto,
// rather than the full-width grid Dashboard uses - three independent forms (profile,
// change password, delete account) don't benefit from multiple columns the way Dashboard's four
// same-shaped summary cards do.
//
// Card.tsx itself is deliberately left untouched (every auth page still relies on its narrow
// default) - a local wrapper here, rather than trying to override Card's own `max-w-sm` utility
// class from this call site, also sidesteps a genuine Tailwind gotcha: two conflicting `max-w-*`
// utility classes on the same element aren't guaranteed to resolve in the order they're written -
// which one wins depends on Tailwind's own internal generation order, not "the later class in the
// string wins." A dedicated wrapper only ever has one max-width utility applied to it, so there's
// no such conflict to have.
function SectionCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
}

const DEFAULT_REMINDER_TIME = "20:00";

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
      <SectionCard>
        <CollapsibleSection title="Profile" storageKey="settings.profile">
          <p className="text-sm text-text-muted">Loading…</p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  if (loadError) {
    return (
      <SectionCard>
        <CollapsibleSection title="Profile" storageKey="settings.profile">
          <p role="alert" className="text-sm text-danger">
            Couldn't load your profile. Please refresh the page.
          </p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Profile" storageKey="settings.profile">
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
      </CollapsibleSection>
    </SectionCard>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection() {
  const { preference, setPreference } = useThemePreference();

  return (
    <SectionCard>
      <CollapsibleSection title="Appearance" storageKey="settings.appearance">
        <p className="mb-4 text-sm text-text-muted">
          Choose whether WellTrack follows your device's light/dark setting, or always uses one
          regardless of it.
        </p>
        {/* Three-way System/Light/Dark toggle, rather than a plain two-state light/dark switch -
            "System" is the default for a reason (see useThemePreference.ts and index.css): most
            visitors should just inherit whatever their OS is already set to, with an explicit
            override only for the minority who want to disagree with it. A single on/off switch
            can't represent "no explicit opinion, follow the OS" as a third state, only pick one
            of the two extremes. Reuses this page's own Button component (the same primary/
            secondary variants ProfileSection's own controls use) as a segmented control, rather
            than introducing a new control type this codebase doesn't have anywhere else yet.

            setPreference (see useThemePreference.ts) updates the "color-scheme" meta tag and the
            matching CSS property, not just the --color-* tokens - skipping that step is a real
            bug this app already shipped once: BottomNav's own labels went invisible on Android
            because Chrome's auto-dark heuristic recolored them independently of this app's CSS,
            with nothing telling it not to (commit 0bf7277 / PR #89; see also
            docs/log/01-auth-backend.md's most recent entry for a different Android-only bug from
            the same "browser does something behind this app's back" family).

            This toggle is also deliberately self-contained - it swaps CSS variables and this
            page's own React state directly, with no App.tsx involvement. A parallel workstream,
            in a different worktree, is about to make its own App.tsx change (mounting a toast
            notification system); keeping this toggle out of App.tsx avoids a merge conflict with
            that unrelated change. If a future App.tsx-level feature ever needs to react to the
            active theme too, the wiring it would need is a one-line read of the same
            "welltrack:theme" localStorage key / data-theme attribute this toggle already
            maintains - nothing here would need to change for that to work. */}
        <div role="group" aria-label="Theme" className="flex gap-2">
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={preference === option.value ? "primary" : "secondary"}
              aria-pressed={preference === option.value}
              onClick={() => setPreference(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CollapsibleSection>
    </SectionCard>
  );
}

function RemindersSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserProfile>("/api/users/me")
      .then((profile) => {
        if (cancelled) return;
        setReminderEnabled(profile.reminderEnabled ?? false);
        setReminderTime(profile.reminderTime ?? DEFAULT_REMINDER_TIME);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Fetched up front (not inside handleSubmit) so enabling reminders can call
    // subscribeToPush - and therefore Notification.requestPermission() - with no network
    // round-trip in between the click and the permission request. Browsers only honor a
    // permission request as tied to the user's actual gesture for a short window; an awaited
    // fetch in between (the previous shape of this code) was long enough for mobile Chrome to
    // silently auto-deny the request without ever showing the real prompt, which also means it
    // never persisted an actual "blocked" site entry - confirmed directly against a real device.
    apiFetch<{ publicKey: string }>("/api/push/vapid-public-key")
      .then((res) => {
        if (!cancelled) setVapidPublicKey(res.publicKey);
      })
      .catch(() => {
        // Reminders simply can't be enabled from this session if this fails - handleSubmit's
        // own guard below surfaces that, rather than duplicating an error message here too.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);

    try {
      if (reminderEnabled) {
        // Requests notification permission and subscribes this browser first - if the user
        // says no, or this browser can't do push at all, the preference below is never saved
        // as enabled, so Settings doesn't claim a reminder will arrive when nothing was ever
        // actually set up to deliver one. Uses the key already fetched on mount (see the effect
        // above) rather than fetching it here - an await right before requestPermission() risks
        // losing the user gesture this call needs.
        if (!vapidPublicKey) {
          throw new Error("VAPID public key is not available yet");
        }
        await subscribeToPush(vapidPublicKey);
      } else {
        // Best-effort - reminders can be turned off from a different browser/device than the
        // one that's actually subscribed, so there may be nothing to unsubscribe here at all.
        await unsubscribeFromPush();
      }

      await apiFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ reminderEnabled, reminderTime }),
      });
      setSaved(true);
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        setSaveError(
          "Notifications were blocked. Allow notifications for this site in your browser's settings, then try again.",
        );
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        setSaveError("Please check the highlighted fields.");
      } else {
        setSaveError("Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard>
        <CollapsibleSection title="Reminders" storageKey="settings.reminders">
          <p className="text-sm text-text-muted">Loading…</p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  if (loadError) {
    return (
      <SectionCard>
        <CollapsibleSection title="Reminders" storageKey="settings.reminders">
          <p role="alert" className="text-sm text-danger">
            Couldn't load your reminder settings. Please refresh the page.
          </p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Reminders" storageKey="settings.reminders">
        {!isPushSupported() ? (
          <p className="text-sm text-text-muted">
            This browser can't receive notifications. On iPhone, add WellTrack to your Home Screen
            first (Share → Add to Home Screen), then open it from there to enable reminders.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <p className="text-sm text-text-muted">
              Get a notification if you haven't logged anything yet by a time you choose.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-text">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
              Remind me
            </label>
            {reminderEnabled && (
              <div className="flex flex-col gap-1">
                <label htmlFor="reminder-time" className="text-sm font-medium text-text">
                  Remind me at
                </label>
                <input
                  id="reminder-time"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-40 rounded-lg border border-border px-3 py-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </div>
            )}
            {saveError && (
              <p role="alert" className="text-sm text-danger">
                {saveError}
              </p>
            )}
            {saved && !saveError && (
              <p role="status" className="text-sm text-success">
                Reminder settings saved.
              </p>
            )}
            <Button type="submit" disabled={saving} className="self-start">
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </CollapsibleSection>
    </SectionCard>
  );
}

function ExportDataSection() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const { blob, filename } = await apiFetchFile("/api/export");
      // No <a download> in this app's own markup - the file only exists as an in-memory Blob
      // fetched via the same authenticated apiFetch machinery every other request on this page
      // uses (see api/client.ts's apiFetchFile), not a URL the browser could navigate to on its
      // own, so triggering the save has to go through a real (if synthetic, momentarily
      // appended-and-removed) anchor click rather than a plain href.
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename ?? "welltrack-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setExportError("Something went wrong exporting your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Export your data" storageKey="settings.export">
        <p className="mb-4 text-sm text-text-muted">
          Download every mood, symptom, medication, and habit entry you've logged - along with your
          own symptom, medication, and habit definitions - as a single JSON file.
        </p>
        <div className="flex flex-col gap-4">
          {exportError && (
            <p role="alert" className="text-sm text-danger">
              {exportError}
            </p>
          )}
          <Button type="button" onClick={handleExport} disabled={exporting} className="self-start">
            {exporting ? "Preparing download…" : "Download my data"}
          </Button>
        </div>
      </CollapsibleSection>
    </SectionCard>
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
    <SectionCard>
      <CollapsibleSection title="Delete account" storageKey="settings.deleteAccount">
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
      </CollapsibleSection>
    </SectionCard>
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
          <AppearanceSection />
        </section>

        <section className="mt-6">
          <RemindersSection />
        </section>

        <section className="mt-6">
          <SectionCard>
            <CollapsibleSection title="Change password" storageKey="settings.changePassword">
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
            </CollapsibleSection>
          </SectionCard>
        </section>

        <section className="mt-6">
          <ExportDataSection />
        </section>

        <section className="mt-6">
          <AccountDeletionSection />
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

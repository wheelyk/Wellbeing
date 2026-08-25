import { useEffect, useState, type FormEvent, type HTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { CategoryCreateForm, type Category } from "../components/CategoryCreateForm";
import { MedicationCreateForm } from "../components/MedicationCreateForm";
import type { Medication } from "../components/MedicationEntryForm";
import {
  ReminderCreateForm,
  type Reminder,
  type ReminderTarget,
  type ReminderCreateInput,
} from "../components/ReminderCreateForm";

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
  moodEnabled: boolean;
  medicationEnabled: boolean;
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

// Maps a reminder's target to the built-in-category toggle (Settings > Built-in categories,
// itself mirrored on AuthUser - see AuthContext.tsx) that can explain why it's currently
// disabled - GENERAL has no matching toggle (it's the whole-app nudge, not tied to any one
// category), and CATEGORY is handled separately below (an archived, not toggled-off, category).
const TOGGLE_FIELD_BY_TARGET: Partial<Record<ReminderTarget, keyof CategoryToggles>> = {
  mood: "moodEnabled",
  medication: "medicationEnabled",
};

const TOGGLE_FIELD_LABEL: Record<keyof CategoryToggles, string> = {
  moodEnabled: "Mood",
  medicationEnabled: "Medications",
};

function reminderTargetLabel(reminder: Reminder): string {
  switch (reminder.target) {
    case "general":
      return "General";
    case "mood":
      return "Mood";
    case "medication":
      return reminder.medication
        ? reminder.medication.dosage
          ? `${reminder.medication.name} — ${reminder.medication.dosage}`
          : reminder.medication.name
        : "Medication";
    case "category":
      return reminder.category
        ? `${reminder.category.icon ? `${reminder.category.icon} ` : ""}${reminder.category.name}`
        : "Category";
  }
}

// Explains *why* an already-disabled reminder is disabled, when that reason is something the
// user set elsewhere rather than this reminder's own toggle - so re-enabling it here wouldn't
// actually do anything until the real cause is addressed. Returns null once the reminder is
// enabled (the toggle switch on the row already communicates "off" plainly enough on its own) or
// when there's no more specific reason than "the user turned this one off."
function reminderInactiveNote(
  reminder: Reminder,
  toggles: CategoryToggles,
  visibleCategoryIds: Set<string>,
): string | null {
  if (reminder.enabled) return null;

  const toggleField = TOGGLE_FIELD_BY_TARGET[reminder.target];
  if (toggleField && !toggles[toggleField]) {
    return `${TOGGLE_FIELD_LABEL[toggleField]} is currently turned off in Settings.`;
  }
  if (
    reminder.target === "category" &&
    reminder.categoryId &&
    !visibleCategoryIds.has(reminder.categoryId)
  ) {
    return "This category has been archived.";
  }
  return null;
}

// Replaces the old single checkbox-plus-time model (one reminder per account) with full CRUD
// over the generalized per-target Reminder model (see backend/src/routes/reminders.ts) - a
// management list (resolved target label, times as chips, an enabled toggle, edit/delete) plus a
// "+ Add reminder" form. The existing subscribeToPush/unsubscribeFromPush gesture-preservation
// logic in pushNotifications.ts is reused completely unchanged, just re-triggered by "this is
// about to become the account's first enabled reminder" / "this was the account's last enabled
// reminder" instead of one checkbox's own on/off state.
function RemindersSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTimes, setEditTimes] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Reminder[]>("/api/reminders"),
      apiFetch<Medication[]>("/api/medications"),
      apiFetch<Category[]>("/api/categories"),
    ])
      .then(([remindersRes, medicationsRes, categoriesRes]) => {
        if (cancelled) return;
        setReminders(remindersRes);
        setMedications(medicationsRes);
        setCategories(categoriesRes);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Fetched up front, alongside everything above, for the same reason the old single-reminder
    // RemindersSection already fetched it up front rather than inside a submit handler: enabling
    // push has to call Notification.requestPermission() with no network round-trip in between the
    // user's click and that call, or mobile Chrome silently auto-denies it without ever showing
    // the real prompt - confirmed directly against a real device (see pushNotifications.ts).
    apiFetch<{ publicKey: string }>("/api/push/vapid-public-key")
      .then((res) => {
        if (!cancelled) setVapidPublicKey(res.publicKey);
      })
      .catch(() => {
        // A create/enable that would need push simply fails with its own guard below - no need
        // to duplicate an error message here too.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggles: CategoryToggles = {
    moodEnabled: user?.moodEnabled ?? true,
    medicationEnabled: user?.medicationEnabled ?? true,
  };
  const visibleCategoryIds = new Set(categories.map((c) => c.id));
  const hasEnabledReminder = reminders.some((r) => r.enabled);

  // Medications/categories were only ever fetched once, on this section's own mount - stale the
  // moment a user creates one in MedicationsSection/CategoriesSection further down the same page
  // and then opens this form to attach a reminder to it, since those are separate, independently-
  // mounted sections with no shared store (the same deliberate "each section owns its own fetch/
  // state" convention DashboardSummary's own comment documents - see also this project's Explore-
  // confirmed research for Task 5). Refetching right as the form opens, rather than continuously,
  // keeps the sub-pickers correct for the interaction that actually needs them without adding
  // cross-section reactivity this app doesn't otherwise have.
  async function handleOpenCreateForm() {
    try {
      const [medicationsRes, categoriesRes] = await Promise.all([
        apiFetch<Medication[]>("/api/medications"),
        apiFetch<Category[]>("/api/categories"),
      ]);
      setMedications(medicationsRes);
      setCategories(categoriesRes);
    } catch {
      // Falls back to whatever was already loaded - the create form still works, just possibly
      // missing a very recently added medication/category until the next refresh.
    }
    setShowCreateForm(true);
  }

  async function handleCreate(input: ReminderCreateInput) {
    if (!hasEnabledReminder) {
      if (!vapidPublicKey) {
        throw new Error("VAPID public key is not available yet");
      }
      await subscribeToPush(vapidPublicKey);
    }
    const reminder = await apiFetch<Reminder>("/api/reminders", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setReminders((prev) => [...prev, reminder]);
    setShowCreateForm(false);
  }

  async function handleToggleEnabled(reminder: Reminder, nextEnabled: boolean) {
    setRowError(null);
    const wasOnlyEnabledOne = reminder.enabled && reminders.filter((r) => r.enabled).length === 1;
    try {
      if (nextEnabled && !hasEnabledReminder) {
        if (!vapidPublicKey) {
          throw new Error("VAPID public key is not available yet");
        }
        await subscribeToPush(vapidPublicKey);
      }
      const updated = await apiFetch<Reminder>(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (!nextEnabled && wasOnlyEnabledOne) {
        // Best-effort - reminders can be turned off from a different browser/device than the
        // one that's actually subscribed, so there may be nothing to unsubscribe here at all.
        await unsubscribeFromPush().catch(() => {});
      }
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        setRowError(
          "Notifications were blocked. Allow notifications for this site in your browser's settings, then try again.",
        );
      } else {
        setRowError("Something went wrong. Please try again.");
      }
    }
  }

  function startEditTimes(reminder: Reminder) {
    setEditingId(reminder.id);
    setEditTimes(reminder.times);
    setEditError(null);
  }

  function handleEditTimeChange(index: number, value: string) {
    setEditTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function handleEditAddTime() {
    setEditTimes((prev) => [...prev, ""]);
  }

  function handleEditRemoveTime(index: number) {
    setEditTimes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleEditSave(id: string) {
    const filtered = editTimes.map((t) => t.trim()).filter(Boolean);
    if (filtered.length === 0) {
      setEditError("At least one time is required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await apiFetch<Reminder>(`/api/reminders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ times: filtered }),
      });
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
    } catch {
      setEditError("Something went wrong saving this reminder. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(reminder: Reminder) {
    const confirmed = window.confirm("Delete this reminder? This can't be undone.");
    if (!confirmed) return;

    const wasOnlyEnabledOne = reminder.enabled && reminders.filter((r) => r.enabled).length === 1;
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
    try {
      await apiFetch(`/api/reminders/${reminder.id}`, { method: "DELETE" });
      if (wasOnlyEnabledOne) {
        await unsubscribeFromPush().catch(() => {});
      }
    } catch {
      setReminders(previous);
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
            Couldn't load your reminders. Please refresh the page.
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
            first (Share → Add to Home Screen), then open it from there to set up reminders.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-muted">
              Get a notification if you haven't logged something yet by a time (or times) you choose
              - one reminder for General or Mood, plus as many as you like for specific medications
              or categories.
            </p>
            {rowError && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {rowError}
              </p>
            )}
            {reminders.length === 0 ? (
              <p className="text-sm text-text-muted">No reminders yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {reminders.map((reminder) => {
                  const isEditing = editingId === reminder.id;
                  const inactiveNote = reminderInactiveNote(reminder, toggles, visibleCategoryIds);
                  return (
                    <li
                      key={reminder.id}
                      className="rounded-xl border border-border bg-surface-muted p-3"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm font-medium text-text">
                            {reminderTargetLabel(reminder)}
                          </p>
                          {editTimes.map((time, index) => (
                            <div key={index} className="flex items-end gap-2">
                              <TextField
                                label={`Time ${index + 1}`}
                                type="time"
                                value={time}
                                onChange={(e) => handleEditTimeChange(index, e.target.value)}
                                className="w-40"
                              />
                              {editTimes.length > 1 && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleEditRemoveTime(index)}
                                  aria-label={`Remove time ${index + 1}`}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          ))}
                          {editTimes.length < 6 && (
                            <button
                              type="button"
                              onClick={handleEditAddTime}
                              className="self-start text-sm font-medium text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                              + Add another time
                            </button>
                          )}
                          {editError && (
                            <p role="alert" className="text-sm text-danger">
                              {editError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleEditSave(reminder.id)}
                              disabled={editSaving}
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setEditingId(null)}
                              disabled={editSaving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-text">{reminderTargetLabel(reminder)}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {reminder.times.map((time) => (
                                <span
                                  key={time}
                                  className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted"
                                >
                                  {time}
                                </span>
                              ))}
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-sm text-text">
                              <input
                                type="checkbox"
                                checked={reminder.enabled}
                                onChange={(e) => handleToggleEnabled(reminder, e.target.checked)}
                                className="h-4 w-4 rounded border-border text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                              />
                              Enabled
                            </label>
                            {inactiveNote && (
                              <p className="mt-1 text-xs text-text-muted">{inactiveNote}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="secondary" onClick={() => startEditTimes(reminder)}>
                              Edit
                            </Button>
                            <Button variant="secondary" onClick={() => handleDelete(reminder)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {showCreateForm ? (
              <div className="mt-4 border-t border-border pt-4">
                <ReminderCreateForm
                  medications={medications}
                  categories={categories}
                  onSubmit={handleCreate}
                  onCancel={() => setShowCreateForm(false)}
                />
              </div>
            ) : (
              <Button type="button" onClick={handleOpenCreateForm} className="mt-4 self-start">
                + Add reminder
              </Button>
            )}
          </>
        )}
      </CollapsibleSection>
    </SectionCard>
  );
}

interface CategoryToggles {
  moodEnabled: boolean;
  medicationEnabled: boolean;
}

const DEFAULT_TOGGLES: CategoryToggles = {
  moodEnabled: true,
  medicationEnabled: true,
};

const TOGGLE_ITEMS: Array<{ key: keyof CategoryToggles; label: string; description: string }> = [
  { key: "moodEnabled", label: "Mood", description: "Daily mood check-ins." },
  { key: "medicationEnabled", label: "Medications", description: "Log doses taken or missed." },
];

// Lets a user hide one of the two remaining built-in categories from Dashboard/Quick Add without
// touching anything already logged under it - placed above CategoriesSection (custom
// categories), since both are ultimately about "what shows up to log," just for these fixed
// built-ins versus a user's own extensible ones. Habit and Symptom each had a toggle here too
// until Phase 17 folded them into Category - a former habit is now an ordinary personal category,
// hidden (via archive) individually through CategoriesSection below; a former symptom is a
// system-or-personal category, hidden per-row (via the Hide/Unhide action, for system ones -
// Task 1's HiddenCategory mechanism) or archived (for personal ones) through that same section,
// not a toggle of its own here.
function BuiltInCategoriesSection() {
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toggles, setToggles] = useState<CategoryToggles>(DEFAULT_TOGGLES);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserProfile>("/api/users/me")
      .then((profile) => {
        if (cancelled) return;
        setToggles({
          moodEnabled: profile.moodEnabled ?? true,
          medicationEnabled: profile.medicationEnabled ?? true,
        });
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const profile = await apiFetch<UserProfile>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(toggles),
      });
      const updated: CategoryToggles = {
        moodEnabled: profile.moodEnabled ?? true,
        medicationEnabled: profile.medicationEnabled ?? true,
      };
      setToggles(updated);
      // Keeps Dashboard/Quick Add/the summary line in sync immediately in this same session,
      // rather than only after a reload re-runs rehydrateSession - the same lesson isAdmin
      // already established for AuthContext-derived state (see AuthContext.tsx's own comment on
      // updateUser).
      updateUser(updated);
      setSaved(true);
    } catch {
      setSaveError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard>
        <CollapsibleSection title="Built-in categories" storageKey="settings.builtInCategories">
          <p className="text-sm text-text-muted">Loading…</p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  if (loadError) {
    return (
      <SectionCard>
        <CollapsibleSection title="Built-in categories" storageKey="settings.builtInCategories">
          <p role="alert" className="text-sm text-danger">
            Couldn't load your category settings. Please refresh the page.
          </p>
        </CollapsibleSection>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Built-in categories" storageKey="settings.builtInCategories">
        <p className="mb-4 text-sm text-text-muted">
          Turn off any of these you don't want to track - they'll disappear from Dashboard and Quick
          Add, but anything already logged stays exactly as it is.
        </p>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-3">
            {/* The description sits outside <label> (a sibling <p>, not nested text) so it
                doesn't get folded into the checkbox's own accessible name alongside item.label -
                getByLabelText(/^mood$/i) needs "Mood" alone, not "Mood Daily mood check-ins." */}
            {TOGGLE_ITEMS.map((item) => (
              <div key={item.key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={toggles[item.key]}
                    onChange={(e) =>
                      setToggles((prev) => ({ ...prev, [item.key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <span className="text-sm font-medium text-text">{item.label}</span>
                </label>
                <p className="ml-6 text-xs text-text-muted">{item.description}</p>
              </div>
            ))}
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
          {saved && !saveError && (
            <p role="status" className="text-sm text-success">
              Category settings saved.
            </p>
          )}
          <Button type="submit" disabled={saving} className="self-start">
            {saving ? "Saving…" : "Save category settings"}
          </Button>
        </form>
      </CollapsibleSection>
    </SectionCard>
  );
}

// Lists and manages a user's own medications - previously the only way to create one at all
// was buried inside logging a dose (see MedicationEntryForm's own inline "+ Add another
// medication" affordance); PATCH/DELETE /api/medications/:id already existed on the backend with
// no frontend caller at all until this section. Mirrors CategoriesSection's own list/edit/create
// shape, minus the built-in-vs-custom distinction Category has (every Medication is a user's own,
// there's no system-wide medication concept) and minus a valueType picker (Medication only ever
// has a name and an optional dosage).
function MedicationsSection() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDosage, setEditDosage] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Medication[]>("/api/medications")
      .then((res) => {
        if (!cancelled) setMedications(res);
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

  function handleCreated(medication: Medication) {
    setMedications((prev) => [...prev, medication].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreateForm(false);
    setActionMessage("Medication added.");
  }

  function startEdit(medication: Medication) {
    setEditingId(medication.id);
    setEditName(medication.name);
    setEditDosage(medication.dosage ?? "");
    setEditError(null);
  }

  async function handleEditSave(id: string) {
    if (!editName.trim()) {
      setEditError("Give this medication a name.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await apiFetch<Medication>(`/api/medications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), dosage: editDosage.trim() || undefined }),
      });
      setMedications((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
    } catch {
      setEditError("Something went wrong saving this medication. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    // A real hard delete, unlike Category's archive - schema.prisma's MedicationLog.medication
    // relation is onDelete: Cascade, so this also permanently removes every logged dose against
    // it, not just the medication definition. The confirmation is explicit about that, rather
    // than reusing CategoriesSection's own "existing entries are kept" wording, which would be
    // actively wrong here.
    const confirmed = window.confirm(
      "Delete this medication? This also permanently deletes every logged entry for it. This can't be undone.",
    );
    if (!confirmed) return;

    const previous = medications;
    setMedications((prev) => prev.filter((m) => m.id !== id));
    try {
      await apiFetch(`/api/medications/${id}`, { method: "DELETE" });
      setActionMessage("Medication deleted.");
    } catch {
      setMedications(previous);
      setActionMessage(null);
    }
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Medications" storageKey="settings.medications">
        <p className="mb-4 text-sm text-text-muted">
          Manage the medications you log doses for - add a new one, rename one, or remove one you no
          longer take.
        </p>
        {loading && <p className="text-sm text-text-muted">Loading…</p>}
        {loadError && (
          <p role="alert" className="text-sm text-danger">
            Couldn't load your medications. Please refresh the page.
          </p>
        )}
        {!loading && !loadError && (
          <>
            {actionMessage && (
              <p role="status" className="mb-3 text-sm text-success">
                {actionMessage}
              </p>
            )}
            {medications.length === 0 ? (
              <p className="text-sm text-text-muted">No medications yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {medications.map((medication) => {
                  const isEditing = editingId === medication.id;
                  return (
                    <li
                      key={medication.id}
                      className="rounded-xl border border-border bg-surface-muted p-3"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <TextField
                              label="Name"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                            <TextField
                              label="Dosage"
                              value={editDosage}
                              onChange={(e) => setEditDosage(e.target.value)}
                            />
                          </div>
                          {editError && (
                            <p role="alert" className="text-sm text-danger">
                              {editError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleEditSave(medication.id)}
                              disabled={editSaving}
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setEditingId(null)}
                              disabled={editSaving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-text">{medication.name}</p>
                            {medication.dosage && (
                              <p className="text-xs text-text-muted">{medication.dosage}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="secondary" onClick={() => startEdit(medication)}>
                              Edit
                            </Button>
                            <Button variant="secondary" onClick={() => handleDelete(medication.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {showCreateForm ? (
              <div className="mt-4 border-t border-border pt-4">
                <MedicationCreateForm
                  onCreated={handleCreated}
                  onCancel={() => setShowCreateForm(false)}
                />
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mt-4 self-start"
              >
                + New medication
              </Button>
            )}
          </>
        )}
      </CollapsibleSection>
    </SectionCard>
  );
}

function describeValueType(category: Category): string {
  switch (category.valueType) {
    case "boolean":
      return "Yes / No";
    case "numeric":
      return "Number";
    case "scale":
      return `Scale (${category.scaleMin}-${category.scaleMax})`;
    case "duration":
      return "Duration (minutes)";
  }
}

// Lists every category visible to this user (their own, plus any admin-created built-ins),
// with create/edit/archive available only for their own - a system category never shows those
// actions at all, mirroring how categories.ts's own PATCH/DELETE routes 404 on a system
// category's id for a regular user (there's nothing to hide by disabling a button that would
// fail anyway, but a visibly missing action is clearer than a button that errors on click).
// includeHidden=true (see backend's categories.ts) is what this management list needs and
// Dashboard/Quick Add's own fetch deliberately doesn't - a hidden system category still has to
// show up here (with an Unhide action), or hiding it would be a one-way trip with no way back.
type ManagedCategory = Category & { hidden: boolean };

function CategoriesSection() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ManagedCategory[]>("/api/categories?includeHidden=true")
      .then((res) => {
        if (!cancelled) setCategories(res);
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

  function handleCreated(category: Category) {
    setCategories((prev) =>
      [...prev, { ...category, hidden: false }].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShowCreateForm(false);
    setActionMessage("Category created.");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon ?? "");
    setEditError(null);
  }

  async function handleEditSave(id: string) {
    if (!editName.trim()) {
      setEditError("Give this category a name.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await apiFetch<Category>(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), icon: editIcon.trim() || null }),
      });
      // PATCH's response has no `hidden` field of its own (editing never changes it) - preserved
      // from the existing row rather than defaulting to false.
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...updated, hidden: c.hidden } : c)),
      );
      setEditingId(null);
    } catch {
      setEditError("Something went wrong saving this category. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleArchive(id: string) {
    // Archiving (not deleting) is the real backend action here (see categories.ts) - existing
    // entries against this category are kept, just no longer offered for new logging.
    const confirmed = window.confirm(
      "Archive this category? Existing entries are kept, but it won't be offered for new logging.",
    );
    if (!confirmed) return;

    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    try {
      await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
      setActionMessage("Category archived.");
    } catch {
      setCategories(previous);
      setActionMessage(null);
    }
  }

  // Hide/Unhide are only ever offered for a system category (not `isOwn`, see the render below) -
  // this is what actually replaces the old blunt `symptomEnabled` toggle for the 8 former system
  // symptoms (Phase 17 - see docs/log/17-unify-mood-symptom-habit.md's Task 5 entry): each one is
  // now hidden or shown per-row instead of all-or-nothing. Uses Task 1's own
  // POST/DELETE /api/categories/:id/hide endpoints.
  async function handleHide(id: string) {
    const previous = categories;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: true } : c)));
    try {
      await apiFetch(`/api/categories/${id}/hide`, { method: "POST" });
      setActionMessage("Category hidden.");
    } catch {
      setCategories(previous);
      setActionMessage(null);
    }
  }

  async function handleUnhide(id: string) {
    const previous = categories;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: false } : c)));
    try {
      await apiFetch(`/api/categories/${id}/hide`, { method: "DELETE" });
      setActionMessage("Category unhidden.");
    } catch {
      setCategories(previous);
      setActionMessage(null);
    }
  }

  return (
    <SectionCard>
      <CollapsibleSection title="Categories" storageKey="settings.categories">
        <p className="mb-4 text-sm text-text-muted">
          Beyond mood and medications, create your own trackable categories - alongside any an admin
          has added for everyone (including every default symptom, like Headache or Fatigue). Hide a
          built-in one you don&apos;t use instead of deleting it - your own categories are archived
          instead, from the same list.
        </p>
        {user?.isAdmin && (
          <Link
            to="/admin/categories"
            className="mb-4 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            Manage global categories (admin)
          </Link>
        )}
        {loading && <p className="text-sm text-text-muted">Loading…</p>}
        {loadError && (
          <p role="alert" className="text-sm text-danger">
            Couldn't load your categories. Please refresh the page.
          </p>
        )}
        {!loading && !loadError && (
          <>
            {actionMessage && (
              <p role="status" className="mb-3 text-sm text-success">
                {actionMessage}
              </p>
            )}
            {categories.length === 0 ? (
              <p className="text-sm text-text-muted">No categories yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {categories.map((category) => {
                  const isOwn = category.userId === user?.id;
                  const isEditing = editingId === category.id;
                  return (
                    <li
                      key={category.id}
                      className="rounded-xl border border-border bg-surface-muted p-3"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <TextField
                              label="Name"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                            <TextField
                              label="Icon"
                              value={editIcon}
                              onChange={(e) => setEditIcon(e.target.value)}
                              maxLength={8}
                            />
                          </div>
                          {editError && (
                            <p role="alert" className="text-sm text-danger">
                              {editError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleEditSave(category.id)}
                              disabled={editSaving}
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setEditingId(null)}
                              disabled={editSaving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-text">
                              {category.icon ? `${category.icon} ` : ""}
                              {category.name}
                              {!isOwn && (
                                <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                                  Built-in
                                </span>
                              )}
                              {category.hidden && (
                                <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                                  Hidden
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-text-muted">{describeValueType(category)}</p>
                          </div>
                          {isOwn ? (
                            <div className="flex shrink-0 gap-2">
                              <Button variant="secondary" onClick={() => startEdit(category)}>
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handleArchive(category.id)}
                              >
                                Archive
                              </Button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 gap-2">
                              {category.hidden ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleUnhide(category.id)}
                                >
                                  Unhide
                                </Button>
                              ) : (
                                <Button variant="secondary" onClick={() => handleHide(category.id)}>
                                  Hide
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {showCreateForm ? (
              <div className="mt-4 border-t border-border pt-4">
                <CategoryCreateForm
                  onCreated={handleCreated}
                  onCancel={() => setShowCreateForm(false)}
                />
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mt-4 self-start"
              >
                + New category
              </Button>
            )}
          </>
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
          Download every mood, medication, and category entry you've logged - along with your own
          medication and category definitions - as a single JSON file.
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
          This permanently deletes your account and every mood, medication, and category entry
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
          <BuiltInCategoriesSection />
        </section>

        <section className="mt-6">
          <MedicationsSection />
        </section>

        <section className="mt-6">
          <CategoriesSection />
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

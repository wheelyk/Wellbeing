import { useEffect, useMemo, useState, type FormEvent, type HTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, apiFetchFile, ApiError } from "../api/client";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { useThemePreference, type ThemePreference } from "../hooks/useThemePreference";
import { useCollapsedState } from "../hooks/useCollapsedState";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  PushPermissionDeniedError,
} from "../lib/pushNotifications";
import {
  CategoryCreateForm,
  type Category,
  type CategoryGroup,
} from "../components/CategoryCreateForm";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import {
  ReminderCreateForm,
  type Reminder,
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

function reminderTargetLabel(reminder: Reminder): string {
  switch (reminder.target) {
    case "general":
      return "General";
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
// when there's no more specific reason than "the user turned this one off." Habit, Symptom, Mood,
// and Medication each had their own whole-type toggle that could explain this too, until all four
// unified into Category (see docs/log/17-unify-mood-symptom-habit.md and
// docs/log/19-medication-to-category.md) - archiving is now the only reason left.
function reminderInactiveNote(reminder: Reminder, visibleCategoryIds: Set<string>): string | null {
  if (reminder.enabled) return null;

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
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
    Promise.all([apiFetch<Reminder[]>("/api/reminders"), apiFetch<Category[]>("/api/categories")])
      .then(([remindersRes, categoriesRes]) => {
        if (cancelled) return;
        setReminders(remindersRes);
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

  const visibleCategoryIds = new Set(categories.map((c) => c.id));
  const hasEnabledReminder = reminders.some((r) => r.enabled);

  // Categories were only ever fetched once, on this section's own mount - stale the moment a user
  // creates one in CategoriesSection further down the same page and then opens this form to
  // attach a reminder to it, since those are separate, independently-mounted sections with no
  // shared store (the same deliberate "each section owns its own fetch/state" convention
  // DashboardSummary's own comment documents - see also this project's Explore-confirmed research
  // for Task 5). Refetching right as the form opens, rather than continuously, keeps the picker
  // correct for the interaction that actually needs it without adding cross-section reactivity
  // this app doesn't otherwise have.
  async function handleOpenCreateForm() {
    try {
      setCategories(await apiFetch<Category[]>("/api/categories"));
    } catch {
      // Falls back to whatever was already loaded - the create form still works, just possibly
      // missing a very recently added category until the next refresh.
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
              - one reminder for General, plus as many as you like for specific categories (Mood and
              your medications included, since every one of them is a category now).
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
                  const inactiveNote = reminderInactiveNote(reminder, visibleCategoryIds);
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
// with create/edit/delete available only for their own - a system category never shows those
// actions at all, mirroring how categories.ts's own PATCH/DELETE routes 404 on a system
// category's id for a regular user (there's nothing to hide by disabling a button that would
// fail anyway, but a visibly missing action is clearer than a button that errors on click).
// includeHidden=true (see backend's categories.ts) is what this management list needs and
// Dashboard/Quick Add's own fetch deliberately doesn't - a hidden system category still has to
// show up here (with an Unhide action), or hiding it would be a one-way trip with no way back.
type ManagedCategory = Category & { hidden: boolean };
type ManagedGroup = CategoryGroup & { hidden: boolean };

// Bundled rather than nine separate props on GroupSection/CategoryRow below (see
// docs/log/23-category-groups.md) - one category can be mid-edit at a time across the whole
// grouped list, so this state genuinely lives in the parent (CategoriesSection), not per-row.
interface CategoryEditState {
  editingId: string | null;
  name: string;
  icon: string;
  groupId: string;
  error: string | null;
  saving: boolean;
}

interface CategoryRowHandlers {
  onStartEdit: (category: ManagedCategory) => void;
  onNameChange: (value: string) => void;
  onIconChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDeleteClick: (id: string) => void;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
}

function CategoryRow({
  category,
  isOwn,
  editState,
  handlers,
  pickerGroups,
}: {
  category: ManagedCategory;
  isOwn: boolean;
  editState: CategoryEditState;
  handlers: CategoryRowHandlers;
  // Visible (non-hidden) groups, offered as options when moving this category to a different
  // group - a category can still be reassigned away from a hidden group even though the group
  // that put it there no longer shows as a choice here, but it can't be moved back /into/ one
  // through this picker (matching how a hidden category itself doesn't clutter other pickers).
  pickerGroups: CategoryGroup[];
}) {
  const isEditing = editState.editingId === category.id;

  if (isEditing) {
    return (
      <li className="rounded-xl border border-border bg-surface-muted p-3">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <TextField
              label="Name"
              value={editState.name}
              onChange={(e) => handlers.onNameChange(e.target.value)}
            />
            <TextField
              label="Icon"
              value={editState.icon}
              onChange={(e) => handlers.onIconChange(e.target.value)}
              maxLength={8}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`edit-category-group-${category.id}`}
              className="text-sm font-medium text-text"
            >
              Group
            </label>
            <select
              id={`edit-category-group-${category.id}`}
              value={editState.groupId}
              onChange={(e) => handlers.onGroupIdChange(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <option value="">Uncategorized</option>
              {pickerGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.icon ? `${group.icon} ` : ""}
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          {editState.error && (
            <p role="alert" className="text-sm text-danger">
              {editState.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => handlers.onSaveEdit(category.id)}
              disabled={editState.saving}
            >
              {editState.saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handlers.onCancelEdit}
              disabled={editState.saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-surface-muted p-3">
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
            <Button variant="secondary" onClick={() => handlers.onStartEdit(category)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              aria-label={`Delete ${category.name}`}
              onClick={() => handlers.onDeleteClick(category.id)}
            >
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            {category.hidden ? (
              <Button variant="secondary" onClick={() => handlers.onUnhide(category.id)}>
                Unhide
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => handlers.onHide(category.id)}>
                Hide
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

interface GroupEditState {
  editingGroupId: string | null;
  name: string;
  icon: string;
  error: string | null;
  saving: boolean;
}

interface GroupSectionHandlers {
  onStartEditGroup: (group: CategoryGroup) => void;
  onGroupNameChange: (value: string) => void;
  onGroupIconChange: (value: string) => void;
  onSaveGroupEdit: (id: string) => void;
  onCancelGroupEdit: () => void;
  onHideGroup: (id: string) => void;
  onUnhideGroup: (id: string) => void;
}

// One collapsible section per group (or, when `group` is null, the synthetic "Uncategorized"
// bucket for any category with no group at all). Not built from CollapsibleSection - that
// component's entire header is one toggle <button>, with no room for a second, independent
// Hide/Rename action beside it without nesting a <button> inside a <button> (invalid HTML, and
// clicking it would also toggle the section). useCollapsedState directly, the same hook
// CollapsibleSection itself is built on, is what SectionPanel.tsx's own toggle-plus-action header
// already does for exactly this reason.
function GroupSection({
  group,
  categories,
  currentUserId,
  groupEditState,
  groupHandlers,
  categoryEditState,
  categoryHandlers,
  pickerGroups,
}: {
  group: ManagedGroup | null;
  categories: ManagedCategory[];
  currentUserId: string | undefined;
  groupEditState: GroupEditState;
  groupHandlers: GroupSectionHandlers;
  categoryEditState: CategoryEditState;
  categoryHandlers: CategoryRowHandlers;
  pickerGroups: CategoryGroup[];
}) {
  const storageKey = group
    ? `settings.categories.group.${group.id}`
    : "settings.categories.group.uncategorized";
  const { collapsed, toggle } = useCollapsedState(storageKey);
  const contentId = `${storageKey}-content`;
  const isOwnGroup = group !== null && group.userId === currentUserId;
  const isEditingGroup = group !== null && groupEditState.editingGroupId === group.id;

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="flex-1 font-medium text-text">
            {group ? (group.icon ? `${group.icon} ` : "") : "🗂️ "}
            {group ? group.name : "Uncategorized"}
            {group && group.userId === null && (
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                Built-in
              </span>
            )}
            {group?.hidden && (
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                Hidden
              </span>
            )}
          </span>
          <span className="text-xs text-text-muted">{categories.length}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${collapsed ? "" : "rotate-180"}`}
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {group && (
          <div className="flex shrink-0 gap-2">
            {isOwnGroup && (
              <Button variant="secondary" onClick={() => groupHandlers.onStartEditGroup(group)}>
                Rename
              </Button>
            )}
            {group.hidden ? (
              <Button variant="secondary" onClick={() => groupHandlers.onUnhideGroup(group.id)}>
                Unhide
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => groupHandlers.onHideGroup(group.id)}>
                Hide
              </Button>
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <div id={contentId} className="mt-3">
          {isEditingGroup ? (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3">
              <div className="flex gap-2">
                <TextField
                  label="Group name"
                  value={groupEditState.name}
                  onChange={(e) => groupHandlers.onGroupNameChange(e.target.value)}
                />
                <TextField
                  label="Icon"
                  value={groupEditState.icon}
                  onChange={(e) => groupHandlers.onGroupIconChange(e.target.value)}
                  maxLength={8}
                />
              </div>
              {groupEditState.error && (
                <p role="alert" className="text-sm text-danger">
                  {groupEditState.error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => groupHandlers.onSaveGroupEdit(group.id)}
                  disabled={groupEditState.saving}
                >
                  {groupEditState.saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={groupHandlers.onCancelGroupEdit}
                  disabled={groupEditState.saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {categories.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing here yet - a category can be assigned to this group from its own Edit form.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  isOwn={category.userId === currentUserId}
                  editState={categoryEditState}
                  handlers={categoryHandlers}
                  pickerGroups={pickerGroups}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CategoriesSection() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editCategoryGroupId, setEditCategoryGroupId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  // Which of the caller's own categories (by id) the "Delete" confirmation dialog is currently
  // asking about - null means closed. See ConfirmDeleteModal.tsx for why this replaced a native
  // window.confirm() here too, matching History's own precedent.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [groupFormError, setGroupFormError] = useState<string | null>(null);
  const [groupFormSaving, setGroupFormSaving] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupNameValue, setEditGroupNameValue] = useState("");
  const [editGroupIconValue, setEditGroupIconValue] = useState("");
  const [editGroupError, setEditGroupError] = useState<string | null>(null);
  const [editGroupSaving, setEditGroupSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<ManagedCategory[]>("/api/categories?includeHidden=true"),
      apiFetch<ManagedGroup[]>("/api/category-groups?includeHidden=true"),
    ])
      .then(([categoriesRes, groupsRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes);
        setGroups(groupsRes);
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

  // Groups this session actually offers as a destination when creating/moving a category -
  // steering toward an already-hidden group would just recreate the exact clutter hiding it was
  // meant to avoid.
  const pickerGroups = useMemo(() => groups.filter((g) => !g.hidden), [groups]);

  // System groups first (in their original seeded order - see categoryGroups.ts's own comment on
  // why that's a client-side partition, not something the backend's own orderBy can express),
  // then the caller's own custom groups by name, then a final "Uncategorized" bucket only if
  // anything actually needs it - an empty Uncategorized section would just be noise.
  const sections = useMemo(() => {
    const byGroupId = new Map<string, ManagedCategory[]>();
    const uncategorized: ManagedCategory[] = [];
    for (const category of categories) {
      if (category.groupId) {
        const list = byGroupId.get(category.groupId) ?? [];
        list.push(category);
        byGroupId.set(category.groupId, list);
      } else {
        uncategorized.push(category);
      }
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const systemGroups = groups.filter((g) => g.userId === null);
    const personalGroups = groups.filter((g) => g.userId !== null).sort(byName);
    const groupSections = [...systemGroups, ...personalGroups].map((group) => ({
      group,
      categories: (byGroupId.get(group.id) ?? []).sort(byName),
    }));
    return uncategorized.length > 0
      ? [...groupSections, { group: null, categories: uncategorized.sort(byName) }]
      : groupSections;
  }, [categories, groups]);

  function handleCreated(category: Category) {
    setCategories((prev) =>
      [...prev, { ...category, hidden: false }].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShowCreateForm(false);
    setActionMessage("Category created.");
  }

  function startEdit(category: ManagedCategory) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon ?? "");
    setEditCategoryGroupId(category.groupId ?? "");
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
        body: JSON.stringify({
          name: editName.trim(),
          icon: editIcon.trim() || null,
          groupId: editCategoryGroupId || null,
        }),
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

  // Confirming is a separate step from actually deleting (see handleConfirmDelete below) - opens
  // ConfirmDeleteModal rather than acting immediately, so a category can't be soft-deleted by a
  // stray or accidental tap the way a bare button never quite prevents.
  function handleDeleteClick(id: string) {
    setPendingDeleteId(id);
  }

  function handleCancelDelete() {
    setPendingDeleteId(null);
  }

  async function handleConfirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);

    // Soft-deletes (see categories.ts's own DELETE /:id comment) - existing entries against this
    // category are kept, and it's no longer offered for new logging, but it isn't gone yet: it
    // shows up in "Deleted categories" below for the next 30 days, restorable at any time during
    // that window. Only removed for real afterward, and only if it still has no logged entries by
    // then (see categoryPurgeScheduler.ts) - never a silent, permanent loss of real history.
    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    try {
      await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
      setActionMessage("Category deleted. You can restore it from Deleted categories below.");
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

  const categoryHandlers: CategoryRowHandlers = {
    onStartEdit: startEdit,
    onNameChange: setEditName,
    onIconChange: setEditIcon,
    onGroupIdChange: setEditCategoryGroupId,
    onSaveEdit: handleEditSave,
    onCancelEdit: () => setEditingId(null),
    onDeleteClick: handleDeleteClick,
    onHide: handleHide,
    onUnhide: handleUnhide,
  };
  const categoryEditState: CategoryEditState = {
    editingId,
    name: editName,
    icon: editIcon,
    groupId: editCategoryGroupId,
    error: editError,
    saving: editSaving,
  };

  async function handleCreateGroupSubmit(event: FormEvent) {
    event.preventDefault();
    if (!newGroupName.trim()) {
      setGroupFormError("Give this group a name.");
      return;
    }
    setGroupFormSaving(true);
    setGroupFormError(null);
    try {
      const group = await apiFetch<CategoryGroup>("/api/category-groups", {
        method: "POST",
        body: JSON.stringify({ name: newGroupName.trim(), icon: newGroupIcon.trim() || undefined }),
      });
      setGroups((prev) => [...prev, { ...group, hidden: false }]);
      setShowCreateGroupForm(false);
      setNewGroupName("");
      setNewGroupIcon("");
      setActionMessage("Group created.");
    } catch {
      setGroupFormError("Something went wrong creating this group. Please try again.");
    } finally {
      setGroupFormSaving(false);
    }
  }

  function startEditGroup(group: CategoryGroup) {
    setEditingGroupId(group.id);
    setEditGroupNameValue(group.name);
    setEditGroupIconValue(group.icon ?? "");
    setEditGroupError(null);
  }

  async function handleEditGroupSave(id: string) {
    if (!editGroupNameValue.trim()) {
      setEditGroupError("Give this group a name.");
      return;
    }
    setEditGroupSaving(true);
    setEditGroupError(null);
    try {
      const updated = await apiFetch<CategoryGroup>(`/api/category-groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editGroupNameValue.trim(),
          icon: editGroupIconValue.trim() || null,
        }),
      });
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...updated, hidden: g.hidden } : g)));
      setEditingGroupId(null);
    } catch {
      setEditGroupError("Something went wrong saving this group. Please try again.");
    } finally {
      setEditGroupSaving(false);
    }
  }

  async function handleHideGroup(id: string) {
    const previous = groups;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, hidden: true } : g)));
    try {
      await apiFetch(`/api/category-groups/${id}/hide`, { method: "POST" });
      setActionMessage("Group hidden.");
    } catch {
      setGroups(previous);
      setActionMessage(null);
    }
  }

  async function handleUnhideGroup(id: string) {
    const previous = groups;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, hidden: false } : g)));
    try {
      await apiFetch(`/api/category-groups/${id}/hide`, { method: "DELETE" });
      setActionMessage("Group unhidden.");
    } catch {
      setGroups(previous);
      setActionMessage(null);
    }
  }

  const groupHandlers: GroupSectionHandlers = {
    onStartEditGroup: startEditGroup,
    onGroupNameChange: setEditGroupNameValue,
    onGroupIconChange: setEditGroupIconValue,
    onSaveGroupEdit: handleEditGroupSave,
    onCancelGroupEdit: () => setEditingGroupId(null),
    onHideGroup: handleHideGroup,
    onUnhideGroup: handleUnhideGroup,
  };
  const groupEditState: GroupEditState = {
    editingGroupId,
    name: editGroupNameValue,
    icon: editGroupIconValue,
    error: editGroupError,
    saving: editGroupSaving,
  };

  return (
    <SectionCard>
      <CollapsibleSection title="Categories" storageKey="settings.categories">
        <p className="mb-4 text-sm text-text-muted">
          Create your own trackable categories - medications included - alongside any an admin has
          added for everyone (including Mood, Energy, Stress, and every default symptom, like
          Headache or Fatigue), organized into groups. Hide a built-in category or group you
          don&apos;t use instead of deleting it - your own categories can be deleted instead, with a
          30-day window to restore one if you change your mind.
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
            {categories.length === 0 && groups.length === 0 ? (
              <p className="text-sm text-text-muted">No categories yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sections.map(({ group, categories: sectionCategories }) => (
                  <GroupSection
                    key={group?.id ?? "uncategorized"}
                    group={group}
                    categories={sectionCategories}
                    currentUserId={user?.id}
                    groupEditState={groupEditState}
                    groupHandlers={groupHandlers}
                    categoryEditState={categoryEditState}
                    categoryHandlers={categoryHandlers}
                    pickerGroups={pickerGroups}
                  />
                ))}
              </div>
            )}
            {showCreateGroupForm ? (
              <form
                onSubmit={handleCreateGroupSubmit}
                className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3"
              >
                <div className="flex gap-2">
                  <TextField
                    label="Group name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Work Stress"
                  />
                  <TextField
                    label="Icon (optional)"
                    value={newGroupIcon}
                    onChange={(e) => setNewGroupIcon(e.target.value)}
                    placeholder="e.g. 💼"
                    maxLength={8}
                  />
                </div>
                {groupFormError && (
                  <p role="alert" className="text-sm text-danger">
                    {groupFormError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={groupFormSaving}>
                    {groupFormSaving ? "Creating…" : "Create group"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreateGroupForm(false)}
                    disabled={groupFormSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateGroupForm(true)}
                className="mt-4 self-start"
              >
                + New group
              </Button>
            )}
            {showCreateForm ? (
              <div className="mt-4 border-t border-border pt-4">
                <CategoryCreateForm
                  onCreated={handleCreated}
                  onCancel={() => setShowCreateForm(false)}
                  groups={pickerGroups}
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
            <div className="mt-6 border-t border-border pt-4">
              <CollapsibleSection
                title="Deleted categories"
                storageKey="settings.categories.deleted"
                defaultCollapsed
              >
                <DeletedCategoriesSection
                  onRestored={(category) =>
                    setCategories((prev) =>
                      [...prev, { ...category, hidden: false }].sort((a, b) =>
                        a.name.localeCompare(b.name),
                      ),
                    )
                  }
                />
              </CollapsibleSection>
            </div>
          </>
        )}
      </CollapsibleSection>
      <ConfirmDeleteModal
        open={pendingDeleteId !== null}
        title="Delete category?"
        message={`Existing entries against "${
          categories.find((c) => c.id === pendingDeleteId)?.name ?? "this category"
        }" are kept, and it won't be offered for new logging. It'll be permanently removed in 30 days if it still has no entries by then - or you can restore it any time before that from Deleted categories below.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </SectionCard>
  );
}

interface DeletedCategory extends Category {
  purgeEligibleAt: string;
  hasLogs: boolean;
}

// Lazily mounted: CollapsibleSection only renders its children while expanded (see that
// component's own conditional render), so this only fetches once the caller actually opens
// "Deleted categories" - not on every Settings page load, for a list most visits will never need.
function DeletedCategoriesSection({ onRestored }: { onRestored: (category: Category) => void }) {
  const [categories, setCategories] = useState<DeletedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DeletedCategory[]>("/api/categories/deleted")
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

  async function handleRestore(category: DeletedCategory) {
    setRestoringId(category.id);
    try {
      const restored = await apiFetch<Category>(`/api/categories/${category.id}/restore`, {
        method: "POST",
      });
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      onRestored(restored);
    } catch {
      // Left in the list on failure - the button below just stops showing "Restoring…", so the
      // caller can simply try again rather than losing their place.
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn't load deleted categories. Please refresh the page.
      </p>
    );
  }
  if (categories.length === 0) {
    return <p className="text-sm text-text-muted">Nothing deleted right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {categories.map((category) => {
        const daysLeft = Math.max(
          0,
          Math.ceil(
            (new Date(category.purgeEligibleAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          ),
        );
        return (
          <li key={category.id} className="rounded-xl border border-border bg-surface-muted p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-text">
                  {category.icon ? `${category.icon} ` : ""}
                  {category.name}
                </p>
                <p className="text-xs text-text-muted">
                  {category.hasLogs
                    ? "Has entries, so it's kept until you delete those too - it won't be automatically removed."
                    : `Permanently removed in ${daysLeft} day${daysLeft === 1 ? "" : "s"} unless restored.`}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => handleRestore(category)}
                disabled={restoringId === category.id}
                className="shrink-0"
              >
                {restoringId === category.id ? "Restoring…" : "Restore"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
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
          Download every category entry you've logged (Mood check-ins and medication doses included)
          - along with your own category definitions - as a single JSON file.
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
          This permanently deletes your account and every category entry you've logged (Mood
          check-ins and medication doses included). This can't be undone.
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

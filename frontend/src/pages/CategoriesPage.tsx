import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../api/client";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { CollapsibleSection, StatusPill } from "../components/CollapsibleSection";
import { readCollapsedState } from "../hooks/useCollapsedState";
import {
  CategoryCreateForm,
  type Category,
  type CategoryGroup,
} from "../components/CategoryCreateForm";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import { ActionButton } from "../components/ActionButton";
import {
  ReminderScheduleForm,
  type Reminder,
  type ReminderOptions,
} from "../components/ReminderScheduleForm";
import { describeSchedules } from "../lib/cronSchedule";
import { useTimedMessage } from "../hooks/useTimedMessage";
import { Toast } from "../components/Toast";
import { dispatchCollapseAll, listenForCollapsedChanged } from "../lib/collapseAllEvent";
import { dispatchDashboardEntryChanged } from "../lib/dashboardEntryChangedEvent";

// Every group section persists its collapsed state under this prefix, which is also what the
// page’s Collapse/Expand all control broadcasts to (see lib/collapseAllEvent.ts).
const GROUP_COLLAPSE_PREFIX = "categories.group.";

// One place that decides a group's storage key, so the page (which needs to know whether anything
// is expanded) and the section (which owns the state) cannot drift apart.
function groupCollapseKey(group: { id: string } | null): string {
  return group ? `${GROUP_COLLAPSE_PREFIX}${group.id}` : `${GROUP_COLLAPSE_PREFIX}uncategorized`;
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
  onToggleRemind: (id: string) => void;
  onSaveReminder: (categoryId: string, schedules: string[], options: ReminderOptions) => void;
  onDeleteReminder: (categoryId: string) => void;
  onStopTemporaryReminder: (reminderId: string) => void;
}

// Only one reminder form is open at a time across the whole list, so this lives in the page
// rather than per row - the same shape CategoryEditState already has, for the same reason.
interface ReminderUiState {
  openForCategoryId: string | null;
  saving: boolean;
  error: string | null;
}

function CategoryRow({
  category,
  isOwn,
  editState,
  handlers,
  pickerGroups,
  reminder,
  temporaryReminder,
  reminderState,
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
  // This category's own standing reminder, if it has one at all.
  reminder: Reminder | undefined;
  // A temporary one running alongside it - "every two hours for the rest of today", or the
  // one-shot follow-up set from the logging screen. Separate from the standing reminder because
  // they mean different things and are stopped in different ways: the standing one is edited
  // through the bell, this one is simply called off.
  temporaryReminder: Reminder | undefined;
  reminderState: ReminderUiState;
}) {
  const isEditing = editState.editingId === category.id;
  const remindOpen = reminderState.openForCategoryId === category.id;

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
          <p className="text-xs text-text-muted">
            {describeValueType(category)}
            {/* The schedule in plain words, so a whole group can be scanned for what will and
                won't notify without opening anything. */}
            {reminder?.enabled && ` · ${describeSchedules(reminder.schedules)}`}
          </p>
          {/* Shown as its own line rather than appended to the schedule above, because it is a
              different reminder with a different lifetime - and one that is about to stop on its
              own, which the row should say plainly rather than leaving it to look permanent. */}
          {temporaryReminder?.enabled && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-brand">
                Just for today
              </span>
              <span>{describeSchedules(temporaryReminder.schedules)}</span>
              <button
                type="button"
                onClick={() => handlers.onStopTemporaryReminder(temporaryReminder.id)}
                className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand hover:text-danger"
              >
                Stop
              </button>
            </p>
          )}
        </div>
        {/* Icons on a phone, words from `sm:` up (see ActionButton) - three text buttons don't fit
            beside a long category name at 412px, but there's ample room for them on a laptop. The
            bell sits inside this group rather than apart from it, so a row reads as one set of
            actions rather than a reminder control plus some others. */}
        <div className="flex shrink-0 gap-2">
          <ActionButton
            variant={reminder?.enabled ? "primary" : "secondary"}
            icon="🔔"
            label="Remind"
            name={`${reminder?.enabled ? "Edit reminder for" : "Remind me about"} ${category.name}`}
            aria-expanded={remindOpen}
            onClick={() => handlers.onToggleRemind(category.id)}
          />
          {isOwn ? (
            <>
              <ActionButton
                variant="secondary"
                icon="✏️"
                label="Edit"
                name={`Edit ${category.name}`}
                onClick={() => handlers.onStartEdit(category)}
              />
              <ActionButton
                variant="secondary"
                icon="🗑️"
                label="Delete"
                name={`Delete ${category.name}`}
                onClick={() => handlers.onDeleteClick(category.id)}
              />
            </>
          ) : category.hidden ? (
            <ActionButton
              variant="secondary"
              icon="👁️"
              label="Unhide"
              name={`Unhide ${category.name}`}
              onClick={() => handlers.onUnhide(category.id)}
            />
          ) : (
            <ActionButton
              variant="secondary"
              icon="🙈"
              label="Hide"
              name={`Hide ${category.name}`}
              onClick={() => handlers.onHide(category.id)}
            />
          )}
        </div>
      </div>

      {remindOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <ReminderScheduleForm
            initialSchedules={reminder?.schedules ?? []}
            initialOptions={{
              onlyToday: !!reminder?.expiresAt,
              keepRemindingAfterLogging: reminder ? !reminder.stopsWhenLogged : false,
            }}
            saving={reminderState.saving}
            error={reminderState.error}
            onSave={(schedules, options) =>
              handlers.onSaveReminder(category.id, schedules, options)
            }
            onTurnOff={reminder ? () => handlers.onDeleteReminder(category.id) : undefined}
            onCancel={() => handlers.onToggleRemind(category.id)}
          />
        </div>
      )}
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
  standingRemindersByCategoryId,
  temporaryRemindersByCategoryId,
  reminderState,
}: {
  group: ManagedGroup | null;
  categories: ManagedCategory[];
  currentUserId: string | undefined;
  groupEditState: GroupEditState;
  groupHandlers: GroupSectionHandlers;
  categoryEditState: CategoryEditState;
  categoryHandlers: CategoryRowHandlers;
  pickerGroups: CategoryGroup[];
  standingRemindersByCategoryId: Map<string, Reminder>;
  temporaryRemindersByCategoryId: Map<string, Reminder>;
  reminderState: ReminderUiState;
}) {
  const storageKey = groupCollapseKey(group);
  const isOwnGroup = group !== null && group.userId === currentUserId;
  const isEditingGroup = group !== null && groupEditState.editingGroupId === group.id;

  return (
    <div className="rounded-xl border border-border p-3">
      <CollapsibleSection
        storageKey={storageKey}
        size="md"
        // Deliberately not an <h2>: a page renders a dozen of these, and making each one a heading
        // would bury the page's own heading structure in noise.
        heading={false}
        icon={group ? (group.icon ?? undefined) : "🗂️"}
        title={group ? group.name : "Uncategorized"}
        badge={
          group && (group.userId === null || group.hidden) ? (
            <span className="flex gap-2">
              {group.userId === null && <StatusPill>Built-in</StatusPill>}
              {group.hidden && <StatusPill>Hidden</StatusPill>}
            </span>
          ) : undefined
        }
        meta={categories.length}
        contentClassName="mt-3"
        actions={
          group ? (
            // Same icon-then-text treatment as the category rows below, so a group header and the
            // rows inside it don't disagree about how an action is presented at the same width.
            // These carry the group's name too, since a page shows many of them at once.
            <>
              {isOwnGroup && (
                <ActionButton
                  variant="secondary"
                  icon="✏️"
                  label="Rename"
                  name={`Rename ${group.name}`}
                  onClick={() => groupHandlers.onStartEditGroup(group)}
                />
              )}
              {group.hidden ? (
                <ActionButton
                  variant="secondary"
                  icon="👁️"
                  label="Unhide"
                  name={`Unhide ${group.name}`}
                  onClick={() => groupHandlers.onUnhideGroup(group.id)}
                />
              ) : (
                <ActionButton
                  variant="secondary"
                  icon="🙈"
                  label="Hide"
                  name={`Hide ${group.name}`}
                  onClick={() => groupHandlers.onHideGroup(group.id)}
                />
              )}
            </>
          ) : undefined
        }
      >
        <>
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
                  reminder={standingRemindersByCategoryId.get(category.id)}
                  temporaryReminder={temporaryRemindersByCategoryId.get(category.id)}
                  reminderState={reminderState}
                />
              ))}
            </ul>
          )}
        </>
      </CollapsibleSection>
    </div>
  );
}

function CategoriesBody() {
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
  // Self-clearing, and rendered as a floating toast rather than inline at the top of the list -
  // a confirmation for a category near the bottom of a long page used to appear off-screen.
  const { message: actionMessage, showMessage: setActionMessage } = useTimedMessage();
  // Whichever groups have since been toggled by hand, keyed by storage key. Anything not in here
  // has not changed since load, so its stored value is still the truth - which is why this starts
  // empty rather than trying to seed itself.
  //
  // This replaces a flag that simply remembered what the button did last time. That went stale the
  // moment a single group was toggled on its own: the page could be fully expanded while the button
  // still offered "Expand all", which is exactly how it was reported.
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});

  useEffect(
    () =>
      listenForCollapsedChanged((key, collapsed) => {
        if (!key.startsWith(GROUP_COLLAPSE_PREFIX)) return;
        setCollapsedOverrides((prev) => ({ ...prev, [key]: collapsed }));
      }),
    [],
  );
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

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderState, setReminderState] = useState<ReminderUiState>({
    openForCategoryId: null,
    saving: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<ManagedCategory[]>("/api/categories?includeHidden=true"),
      apiFetch<ManagedGroup[]>("/api/category-groups?includeHidden=true"),
      apiFetch<Reminder[]>("/api/reminders"),
    ])
      .then(([categoriesRes, groupsRes, remindersRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes);
        setGroups(groupsRes);
        setReminders(remindersRes);
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

  // What the bulk control should offer next, derived from what the sections actually are rather
  // than from what the button did last. A section that hasn't been touched since load still has
  // its stored value, so that's the fallback; anything toggled since is in the overrides map.
  const anyExpanded = useMemo(
    () =>
      sections.some(({ group }) => {
        const key = groupCollapseKey(group);
        return !(collapsedOverrides[key] ?? readCollapsedState(key));
      }),
    [sections, collapsedOverrides],
  );

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
      setActionMessage("Couldn’t delete that category. Please try again.");
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
      setActionMessage("Couldn’t hide that category. Please try again.");
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
      setActionMessage("Couldn’t unhide that category. Please try again.");
    }
  }

  // Keyed lookups so a row can find its own reminders without scanning the list on every render.
  //
  // Two maps, not one: a category can now have a standing reminder *and* a temporary one at the
  // same time (see docs/log/37-temporary-reminders-backend.md). A single map keyed by category
  // would have silently kept whichever happened to come last in the response - the row would show
  // one of them, seemingly at random, and the bell would edit the wrong one.
  const { standingRemindersByCategoryId, temporaryRemindersByCategoryId } = useMemo(() => {
    const standing = new Map<string, Reminder>();
    const temporary = new Map<string, Reminder>();
    for (const reminder of reminders) {
      if (reminder.target !== "category" || !reminder.categoryId) continue;
      (reminder.expiresAt ? temporary : standing).set(reminder.categoryId, reminder);
    }
    return {
      standingRemindersByCategoryId: standing,
      temporaryRemindersByCategoryId: temporary,
    };
  }, [reminders]);

  function toggleRemind(categoryId: string) {
    setReminderState((prev) => ({
      openForCategoryId: prev.openForCategoryId === categoryId ? null : categoryId,
      saving: false,
      error: null,
    }));
  }

  // Creates the reminder if the category doesn't have one yet, otherwise re-schedules the
  // existing one. The caller doesn't need to know which - it just hands over the expressions the
  // picker produced.
  async function handleSaveReminder(
    categoryId: string,
    schedules: string[],
    options: ReminderOptions,
  ) {
    if (schedules.length === 0) {
      setReminderState((prev) => ({ ...prev, error: "Add at least one time." }));
      return;
    }
    setReminderState((prev) => ({ ...prev, saving: true, error: null }));

    const existing = standingRemindersByCategoryId.get(categoryId);
    // "end-of-day" is a literal the API resolves against the account's own timezone, rather than
    // an instant this browser computes - see routes/reminders.ts for why that distinction matters.
    // Explicit null on the edit path, not omission: leaving the field out would mean "don't touch
    // it", which would make unticking "Only for today" do nothing at all.
    const expiresAt = options.onlyToday ? "end-of-day" : null;
    const stopsWhenLogged = !options.keepRemindingAfterLogging;
    try {
      const saved = existing
        ? await apiFetch<Reminder>(`/api/reminders/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ schedules, enabled: true, expiresAt, stopsWhenLogged }),
          })
        : await apiFetch<Reminder>("/api/reminders", {
            method: "POST",
            body: JSON.stringify({
              target: "category",
              categoryId,
              schedules,
              expiresAt,
              stopsWhenLogged,
            }),
          });

      setReminders((prev) =>
        existing ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved],
      );
      setReminderState({ openForCategoryId: null, saving: false, error: null });
      setActionMessage("Reminder saved.");
      // A schedule change can add, remove, or move a Timeline row for today - Timeline's own
      // listener (see TimelinePanel.tsx) refetches on this the same way a category log or task
      // save already does. Missing before this fix: reminder CRUD lived on this page and Settings
      // alone, and neither ever fired it, so Timeline only ever caught up on its own next full
      // remount rather than being told directly.
      dispatchDashboardEntryChanged();
    } catch (err) {
      // The backend validates every expression with the same parser the scheduler uses, so its
      // message names the actual problem ("The hour field must be between 0 and 23") - far more
      // use than a generic failure line, so it's surfaced rather than swallowed.
      const message =
        err instanceof ApiError && err.code === "VALIDATION_ERROR"
          ? "That schedule isn't valid. Check the expression and try again."
          : "Something went wrong saving this reminder. Please try again.";
      setReminderState((prev) => ({ ...prev, saving: false, error: message }));
    }
  }

  // Calls off a temporary reminder early. Deliberately not routed through the bell: the bell
  // edits the standing schedule, and a "just for today" reminder has nothing worth editing - the
  // only thing anyone wants to do with one before it lapses is stop it.
  async function handleStopTemporaryReminder(reminderId: string) {
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    try {
      await apiFetch(`/api/reminders/${reminderId}`, { method: "DELETE" });
      setActionMessage("Reminder stopped.");
      dispatchDashboardEntryChanged();
    } catch {
      setReminders(previous);
      setActionMessage("Couldn't stop that reminder. Please try again.");
    }
  }

  async function handleDeleteReminder(categoryId: string) {
    const existing = standingRemindersByCategoryId.get(categoryId);
    if (!existing) return;
    setReminderState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await apiFetch(`/api/reminders/${existing.id}`, { method: "DELETE" });
      setReminders((prev) => prev.filter((r) => r.id !== existing.id));
      setReminderState({ openForCategoryId: null, saving: false, error: null });
      setActionMessage("Reminder turned off.");
      dispatchDashboardEntryChanged();
    } catch {
      setReminderState((prev) => ({
        ...prev,
        saving: false,
        error: "Something went wrong turning this reminder off. Please try again.",
      }));
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
    onToggleRemind: toggleRemind,
    onSaveReminder: handleSaveReminder,
    onDeleteReminder: handleDeleteReminder,
    onStopTemporaryReminder: handleStopTemporaryReminder,
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
      setActionMessage("Couldn’t hide that group. Please try again.");
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
      setActionMessage("Couldn’t unhide that group. Please try again.");
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
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Categories</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading
              ? "Loading…"
              : `${categories.length} ${categories.length === 1 ? "category" : "categories"} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
          </p>
        </div>
        {/* Broadcast rather than lifted state: each group keeps owning (and persisting) its own
            collapsed state. The page only listens for what they report, so this control can label
            itself for what would actually happen. See lib/collapseAllEvent.ts. */}
        {!loading && !loadError && sections.length > 0 && (
          <ActionButton
            variant="secondary"
            className="shrink-0"
            icon={anyExpanded ? "⌃" : "⌄"}
            label={anyExpanded ? "Collapse all" : "Expand all"}
            onClick={() => dispatchCollapseAll(GROUP_COLLAPSE_PREFIX, anyExpanded)}
          />
        )}
      </div>
      <p className="mt-3 mb-4 text-sm text-text-muted">
        Create your own trackable categories - medications included - alongside any an admin has
        added for everyone, organized into groups. Hide a built-in category or group you don&apos;t
        use instead of deleting it; your own can be deleted, with a 30-day window to restore one.
        Tap the bell on any category to be reminded about it.
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
                  standingRemindersByCategoryId={standingRemindersByCategoryId}
                  temporaryRemindersByCategoryId={temporaryRemindersByCategoryId}
                  reminderState={reminderState}
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
              storageKey="categories.deleted"
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
      <ConfirmDeleteModal
        open={pendingDeleteId !== null}
        title="Delete category?"
        message={`Existing entries against "${
          categories.find((c) => c.id === pendingDeleteId)?.name ?? "this category"
        }" are kept, and it won't be offered for new logging. It'll be permanently removed in 30 days if it still has no entries by then - or you can restore it any time before that from Deleted categories below.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      <Toast message={actionMessage} />
    </>
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

// Categories and groups outgrew Settings - by the time groups landed, the list was the largest
// thing on a page it shared with profile, appearance, reminders, password and account deletion.
// It gets its own route and its own nav tab here (see
// docs/log/26-categories-page-and-reminder-picker.md).
export function CategoriesPage() {
  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 md:pb-8">
        <CategoriesBody />
      </main>
      <BottomNav />
    </div>
  );
}

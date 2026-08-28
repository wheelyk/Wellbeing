import { useEffect, useState } from "react";
import { NavBar } from "../../components/NavBar";
import { BottomNav } from "../../components/BottomNav";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import {
  CategoryCreateForm,
  type Category,
  type CategoryGroup,
} from "../../components/CategoryCreateForm";
import { apiFetch } from "../../api/client";

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

// Reachable only by the one hardcoded admin account (see RequireAdmin.tsx / backend's
// lib/isAdmin.ts). Every category managed here is system-wide (userId: null) - unlike
// Settings' own CategoriesSection, there's no ownership check anywhere on this page: the admin
// can edit/archive every row shown, because every row shown only exists here at all because it's
// system-wide.
export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  // GET /api/category-groups isn't admin-only (see backend's categoryGroups.ts) - the admin
  // account sees exactly the same built-in groups every regular user does, plus any personal
  // groups of its own (normally none), which is exactly the set adminCategories.ts's own
  // isSystemGroupIdValid() actually allows a system category to be assigned into.
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Category[]>("/api/admin/categories"),
      apiFetch<CategoryGroup[]>("/api/category-groups"),
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

  function groupLabel(groupId: string | null): string | null {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return null;
    return group.icon ? `${group.icon} ${group.name}` : group.name;
  }

  function handleCreated(category: Category) {
    setCategories((prev) => [...prev, category].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreateForm(false);
    setActionMessage("Category created for every user.");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon ?? "");
    setEditGroupId(category.groupId ?? "");
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
      const updated = await apiFetch<Category>(`/api/admin/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          icon: editIcon.trim() || null,
          groupId: editGroupId || null,
        }),
      });
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch {
      setEditError("Something went wrong saving this category. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleArchive(id: string) {
    const confirmed = window.confirm(
      "Archive this category for every user? Existing entries are kept, but it won't be offered for new logging.",
    );
    if (!confirmed) return;

    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    try {
      await apiFetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      setActionMessage("Category archived.");
    } catch {
      setCategories(previous);
      setActionMessage(null);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 md:pb-8">
        <h1 className="text-2xl font-semibold text-text">Manage global categories</h1>
        <p className="mt-2 text-text-muted">
          Categories created here become built-in for every user, alongside medications (including
          Mood, Energy, Stress, and every system symptom such as Headache or Fatigue - each is just
          a system-wide category now).
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {loading && <p className="text-sm text-text-muted">Loading…</p>}
          {loadError && (
            <p role="alert" className="text-sm text-danger">
              Couldn't load global categories. Please refresh the page.
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
                <p className="text-sm text-text-muted">No global categories yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {categories.map((category) => {
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
                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`admin-edit-category-group-${category.id}`}
                                className="text-sm font-medium text-text"
                              >
                                Group
                              </label>
                              <select
                                id={`admin-edit-category-group-${category.id}`}
                                value={editGroupId}
                                onChange={(e) => setEditGroupId(e.target.value)}
                                className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                              >
                                <option value="">Uncategorized</option>
                                {groups.map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.icon ? `${group.icon} ` : ""}
                                    {group.name}
                                  </option>
                                ))}
                              </select>
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
                                {groupLabel(category.groupId) && (
                                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                                    {groupLabel(category.groupId)}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-text-muted">
                                {describeValueType(category)}
                              </p>
                            </div>
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
                    createEndpoint="/api/admin/categories"
                    onCreated={handleCreated}
                    onCancel={() => setShowCreateForm(false)}
                    groups={groups}
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 self-start"
                >
                  + New global category
                </Button>
              )}
            </>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

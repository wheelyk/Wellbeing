import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { CategoryCreateForm, type Category } from "../CategoryCreateForm";
import { CategoryEntryForm, type CategoryLog } from "../CategoryEntryForm";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { formatEntryDateTime } from "../../lib/entryDateLabel";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

// The fourth "scale" type renders as "value/max", matching how Mood's own fixed scale (and,
// before Symptom unified into Category, Symptom's own fixed severity scale) already displays;
// boolean/numeric/duration cover what a former habit's own three types needed.
function formatCategoryLogValue(log: CategoryLog, category: Category | undefined): string {
  if (!category) return "—";
  if (log.valueBoolean !== null) return log.valueBoolean ? "Done" : "Not done";
  if (log.valueDurationMinutes !== null) return `${log.valueDurationMinutes} min`;
  if (log.valueNumeric !== null) {
    if (category.valueType === "scale" && category.scaleMax !== null) {
      return `${log.valueNumeric}/${category.scaleMax}`;
    }
    return `${log.valueNumeric}`;
  }
  return "—";
}

// A third state for defining a category first when the user has none yet.
type CategoryFormMode = "closed" | "log" | "create-category";

// Mirrors every other Section's own PAGE_SIZE/offset-pagination shape.
const PAGE_SIZE = 10;

interface CategoryLogPage {
  entries: CategoryLog[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Unlike the two fixed Dashboard sections (MoodSection, MedicationSection - one file each, by
// this project's own established "adding a log type means adding a file" convention, see
// QuickAddFab.tsx's comment), custom categories are unbounded and created at any time by a user
// or the admin - this section is deliberately the one exception, looping over whatever
// GET /api/categories returns instead of needing a new file per category. Every former habit and
// symptom (both unified into Category - see docs/log/17-unify-mood-symptom-habit.md) renders
// through this same loop now too, not a dedicated fixed section of their own.
export function CategorySection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryLogs, setCategoryLogs] = useState<CategoryLog[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formMode, setFormMode] = useState<CategoryFormMode>("closed");
  // Set only right after CategoryCreateForm succeeds, so the log form that follows opens with
  // the category the user just defined already selected instead of defaulting to categories[0].
  const [categoryToPreselect, setCategoryToPreselect] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<CategoryLog | null>(null);
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Category[]>("/api/categories"),
      apiFetch<CategoryLogPage>(`/api/category-logs?limit=${PAGE_SIZE}&offset=0`),
    ])
      .then(([categoriesRes, logPage]) => {
        if (!cancelled) {
          setCategories(categoriesRes);
          setCategoryLogs(logPage.entries);
          setHasMore(logPage.hasMore);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddButtonClick = useCallback(() => {
    setEditingLog(null);
    setFormMode(categories.length === 0 ? "create-category" : "log");
  }, [categories.length]);

  // Lets QuickAddFab's "More…" entry open this section's add flow directly - see
  // dashboardQuickAddEvent.ts.
  useEffect(
    () => listenForDashboardQuickAdd("category", handleAddButtonClick),
    [handleAddButtonClick],
  );

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await apiFetch<CategoryLogPage>(
        `/api/category-logs?limit=${PAGE_SIZE}&offset=${categoryLogs.length}`,
      );
      setCategoryLogs((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleLoadLess() {
    setCategoryLogs((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  function handleCategoryCreated(category: Category) {
    setCategories((prev) => [...prev, category]);
    setCategoryToPreselect(category.id);
    setFormMode("log");
  }

  function handleLogSaved(log: CategoryLog) {
    setCategoryLogs((prev) => {
      const isEdit = prev.some((l) => l.id === log.id);
      return isEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setFormMode("closed");
    setCategoryToPreselect(null);
    setEditingLog(null);
    showSavedMessage("Entry saved.");
    dispatchDashboardEntryChanged("category");
  }

  function handleLogEdit(log: CategoryLog) {
    setEditingLog(log);
    setFormMode("log");
  }

  function handleFormCancel() {
    setFormMode("closed");
    setEditingLog(null);
  }

  async function handleLogDelete(id: string) {
    const confirmed = window.confirm("Delete this entry? This can't be undone.");
    if (!confirmed) return;

    const previous = categoryLogs;
    setCategoryLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await apiFetch(`/api/category-logs/${id}`, { method: "DELETE" });
      dispatchDashboardEntryChanged("category");
    } catch {
      setCategoryLogs(previous);
    }
  }

  const modalTitle =
    formMode === "create-category"
      ? categories.length === 0
        ? "Create your first category"
        : "Create a new category"
      : editingLog
        ? "Edit entry"
        : "Log an entry";

  return (
    <>
      <SectionPanel
        title="Your categories"
        storageKey="category"
        addLabel="Add category entry"
        onAddClick={handleAddButtonClick}
      >
        {savedMessage && (
          <p role="status" className="mb-3 text-sm font-medium text-success">
            {savedMessage}
          </p>
        )}
        {categoriesLoading && <p className="text-text-muted">Loading…</p>}
        {loadError && (
          <p role="alert" className="text-danger">
            Couldn&apos;t load your categories. Please try refreshing.
          </p>
        )}
        {!categoriesLoading && !loadError && categories.length === 0 && (
          <p className="text-text-muted">
            You haven&apos;t created any categories yet — use the button above to define your own
            (e.g. Water intake, Reading, Sleep) beyond mood and medications.
          </p>
        )}
        {!categoriesLoading && !loadError && categories.length > 0 && categoryLogs.length === 0 && (
          <p className="text-text-muted">
            Nothing logged yet — use the button above to record an entry.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {categoryLogs.map((log) => {
            const category = categoriesById.get(log.categoryId);
            return (
              <li
                key={log.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4"
              >
                <div>
                  <p className="text-text">
                    {category?.icon ? `${category.icon} ` : ""}
                    {category?.name ?? "Unknown category"}: {formatCategoryLogValue(log, category)}
                  </p>
                  {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                  <p className="text-xs text-text-muted">{formatEntryDateTime(log.loggedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleLogEdit(log)}
                    aria-label={`Edit entry from ${formatEntryDateTime(log.loggedAt)}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleLogDelete(log.id)}
                    aria-label={`Delete entry from ${formatEntryDateTime(log.loggedAt)}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {!categoriesLoading && !loadError && (hasMore || categoryLogs.length > PAGE_SIZE) && (
          <div className="mt-4 flex justify-center gap-2">
            {hasMore && (
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
            {categoryLogs.length > PAGE_SIZE && (
              <Button variant="secondary" onClick={handleLoadLess}>
                Load less
              </Button>
            )}
          </div>
        )}
      </SectionPanel>
      <Modal open={formMode !== "closed"} onClose={handleFormCancel} title={modalTitle}>
        {formMode === "log" && (
          <CategoryEntryForm
            key={editingLog?.id ?? categoryToPreselect ?? "create"}
            categories={categories}
            initialCategoryId={categoryToPreselect}
            editingLog={editingLog}
            onSaved={handleLogSaved}
            onCancel={handleFormCancel}
            onAddCategory={() => setFormMode("create-category")}
          />
        )}
        {formMode === "create-category" && (
          <CategoryCreateForm
            onCreated={handleCategoryCreated}
            onCancel={() => setFormMode(categories.length === 0 ? "closed" : "log")}
          />
        )}
      </Modal>
    </>
  );
}

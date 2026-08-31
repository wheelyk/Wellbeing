import { useCallback, useEffect, useState } from "react";
import { Modal } from "../Modal";
import { CategoryCreateForm, type Category } from "../CategoryCreateForm";
import { CategoryEntryForm, type CategoryLog } from "../CategoryEntryForm";
import { apiFetch } from "../../api/client";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";
import {
  listenForTimelineAction,
  type TimelineAction,
} from "../../lib/dashboardTimelineActionEvent";

// Owns the one "log a category" modal every entry point on Dashboard shares - renders nothing
// visible of its own, mount it once per page. Used to be CategorySection, which also rendered a
// visible "Log a category" panel and every per-category card below it; both of those are gone now
// (the panel's job moved into DashboardSummary's own "Log an entry for today" button, and the
// per-category cards were retired outright - see docs/log/50-timeline-v2.md), leaving only the
// discovery-and-logging machinery this file keeps.
//
// Three independent triggers feed one modal, each via its own DOM CustomEvent rather than a prop
// or lifted state (matching this app's own "no shared store between Dashboard sections" decision -
// see dashboardQuickAddEvent.ts's own comment):
//   - QuickAddFab's "+" and DashboardSummary's "Log an entry for today" button both dispatch the
//     existing, payload-free dashboardQuickAddEvent - "open the full picker," unchanged from
//     before this file existed.
//   - A Timeline row dispatches the new dashboardTimelineActionEvent, carrying either an "add"
//     (optionally locked to one categoryId) or an "edit" (a specific logId) - see
//     lib/dashboardTimelineActionEvent.ts and lib/timeline.ts's own timelineRowAction.
type FormMode = "closed" | "log" | "create-category";

// What the log form should actually render once open - resolved once, here, from whichever
// trigger asked for it, so CategoryEntryForm itself stays exactly the two modes it already had
// (full picker, or locked to one category) rather than growing a third.
interface LogFormConfig {
  categories: Category[];
  initialCategoryId: string | null;
  hideCategoryPicker: boolean;
  editingLog: CategoryLog | null;
}

const UNLOCKED = (categories: Category[]): LogFormConfig => ({
  categories,
  initialCategoryId: null,
  hideCategoryPicker: false,
  editingLog: null,
});

export function CategoryLogger() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [logFormConfig, setLogFormConfig] = useState<LogFormConfig | null>(null);
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();
  const { message: actionError, showMessage: showActionError } = useTimedMessage();
  // Queues one trigger that arrived before the initial categories fetch resolved - the same race
  // CategorySection's own `pendingAdd` existed to close (see its comment on the concrete e2e
  // flakiness that motivated it). Generalized here to hold any of the three trigger shapes, not
  // just "open unlocked."
  const [pending, setPending] = useState<"quickadd" | TimelineAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Category[]>("/api/categories")
      .then((res) => {
        if (!cancelled) setCategories(res);
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

  const openUnlocked = useCallback((currentCategories: Category[]) => {
    if (currentCategories.length === 0) {
      setFormMode("create-category");
      return;
    }
    setLogFormConfig(UNLOCKED(currentCategories));
    setFormMode("log");
  }, []);

  // Locked to one category when it's still in the fetched list; falls back to the full picker
  // rather than opening a form with nothing in it - a category a row pointed at can have been
  // archived or hidden in the time since Timeline's own data was fetched, and "open the picker
  // anyway" is a real, useful fallback where a dead click would not be.
  const openLockedAdd = useCallback(
    (currentCategories: Category[], categoryId: string) => {
      const category = currentCategories.find((c) => c.id === categoryId);
      if (!category) {
        openUnlocked(currentCategories);
        return;
      }
      setLogFormConfig({
        categories: [category],
        initialCategoryId: category.id,
        hideCategoryPicker: true,
        editingLog: null,
      });
      setFormMode("log");
    },
    [openUnlocked],
  );

  // Fetches the specific log before opening, since editing needs its full stored values (see
  // CategoryEntryForm's own editingLog prop) - Timeline only ever carries the id, the same
  // "fetch the one thing you need, not everything you might" shape GET /api/category-logs/:id
  // exists for (docs/log/50-timeline-v2.md). A log deleted since Timeline last loaded (another
  // tab, or a stale row) 404s here rather than opening a form with nothing to edit - reported the
  // same way any other failed action already is, not silently.
  const openEdit = useCallback(
    async (currentCategories: Category[], logId: string) => {
      try {
        const log = await apiFetch<CategoryLog>(`/api/category-logs/${logId}`);
        const category = currentCategories.find((c) => c.id === log.categoryId);
        if (!category) {
          showActionError("That entry's category is no longer available.");
          return;
        }
        setLogFormConfig({
          categories: [category],
          initialCategoryId: category.id,
          hideCategoryPicker: true,
          editingLog: log,
        });
        setFormMode("log");
      } catch {
        showActionError("Couldn't open that entry. It may have been deleted.");
      }
    },
    [showActionError],
  );

  const handleQuickAdd = useCallback(() => {
    if (categoriesLoading) {
      setPending("quickadd");
      return;
    }
    openUnlocked(categories);
  }, [categoriesLoading, categories, openUnlocked]);

  const handleTimelineAction = useCallback(
    (action: TimelineAction) => {
      if (categoriesLoading) {
        setPending(action);
        return;
      }
      if (action.type === "edit") {
        void openEdit(categories, action.logId);
      } else if (action.categoryId) {
        openLockedAdd(categories, action.categoryId);
      } else {
        openUnlocked(categories);
      }
    },
    [categoriesLoading, categories, openEdit, openLockedAdd, openUnlocked],
  );

  // Resolves a trigger that arrived before the initial fetch finished - see `pending`'s own
  // comment above.
  useEffect(() => {
    if (categoriesLoading || pending === null) return;
    const action = pending;
    setPending(null);
    if (action === "quickadd") {
      openUnlocked(categories);
    } else if (action.type === "edit") {
      void openEdit(categories, action.logId);
    } else if (action.categoryId) {
      openLockedAdd(categories, action.categoryId);
    } else {
      openUnlocked(categories);
    }
  }, [categoriesLoading, pending, categories, openUnlocked, openLockedAdd, openEdit]);

  useEffect(() => listenForDashboardQuickAdd(handleQuickAdd), [handleQuickAdd]);
  useEffect(() => listenForTimelineAction(handleTimelineAction), [handleTimelineAction]);

  function handleCategoryCreated(category: Category) {
    const next = [...categories, category].sort((a, b) => a.name.localeCompare(b.name));
    setCategories(next);
    // Pre-selected, not UNLOCKED(next) - the caller just spent a whole extra step defining this
    // category specifically to log it; landing back on whatever sorts first (a pre-existing
    // system category, alphabetically ahead of most personal ones) would silently discard that
    // and log against the wrong thing if "Save Entry" were pressed without noticing.
    setLogFormConfig({
      categories: next,
      initialCategoryId: category.id,
      hideCategoryPicker: false,
      editingLog: null,
    });
    setFormMode("log");
  }

  function handleLogSaved() {
    setFormMode("closed");
    setLogFormConfig(null);
    showSavedMessage("Entry saved.");
    dispatchDashboardEntryChanged();
  }

  function handleFormCancel() {
    setFormMode("closed");
    setLogFormConfig(null);
  }

  const modalTitle =
    formMode === "create-category"
      ? categories.length === 0
        ? "Create your first category"
        : "Create a new category"
      : logFormConfig?.editingLog
        ? "Edit entry"
        : "Log an entry";

  return (
    <>
      {savedMessage && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-success/50 bg-surface px-4 py-3 text-center text-sm font-medium text-success shadow-lg md:bottom-8"
        >
          {savedMessage}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-danger/50 bg-surface px-4 py-3 text-center text-sm text-danger shadow-lg md:bottom-8"
        >
          {actionError}
        </p>
      )}
      {loadError && (
        <p
          role="alert"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-danger/50 bg-surface px-4 py-3 text-center text-sm text-danger shadow-lg md:bottom-8"
        >
          Couldn&apos;t load your categories. Please try refreshing.
        </p>
      )}

      <Modal open={formMode !== "closed"} onClose={handleFormCancel} title={modalTitle}>
        {formMode === "log" && logFormConfig && (
          <CategoryEntryForm
            key={logFormConfig.editingLog?.id ?? logFormConfig.initialCategoryId ?? "unlocked"}
            categories={logFormConfig.categories}
            initialCategoryId={logFormConfig.initialCategoryId}
            editingLog={logFormConfig.editingLog}
            hideCategoryPicker={logFormConfig.hideCategoryPicker}
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

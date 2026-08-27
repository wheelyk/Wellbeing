import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { CategoryCreateForm, type Category } from "../CategoryCreateForm";
import { CategoryEntryForm, type CategoryLog } from "../CategoryEntryForm";
import { CategoryLogCard } from "./CategoryLogCard";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { listenForDashboardQuickAdd } from "../../lib/dashboardQuickAddEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

// GET /api/categories always includes both fields now (see categories.ts) - modelled as a local
// extension of the base Category type rather than added to it directly, matching the same
// ManagedCategory pattern SettingsPage's own Settings list already uses, since a category handed
// back from *creating* one (CategoryCreateForm's onCreated) has neither field of its own.
type DashboardCategory = Category & { hidden: boolean; lastLoggedAt: string | null };

type DiscoveryFormMode = "closed" | "log" | "create-category";

// Orchestrates Phase 18's per-category Dashboard cards. Fetches every category visible to this
// caller once, then renders one dedicated CategoryLogCard - its own "Recent <name>" panel, own
// paginated history, own "+" - for every category this caller has actually logged at least once
// (lastLoggedAt !== null), most-recently-logged first. A category with no logs from this caller
// yet gets no card of its own, however many other users (for a system category) may have logged
// it - see docs/log/18-per-category-dashboard-cards.md for the full reasoning, including the
// "only once logged" and "each card gets its own +" decisions this design is built around.
//
// Logging a category for the very first time (or defining a brand-new one) still goes through
// one small, always-present "Log a category" panel below, reachable from QuickAddFab's "+"
// exactly as before - saving through it promotes that category into its own card immediately, by
// updating its lastLoggedAt locally rather than re-fetching.
export function CategorySection() {
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [discoveryFormMode, setDiscoveryFormMode] = useState<DiscoveryFormMode>("closed");
  // Set only right after CategoryCreateForm succeeds, so the log form that follows opens with the
  // category the user just defined already selected instead of defaulting to categories[0].
  const [categoryToPreselect, setCategoryToPreselect] = useState<string | null>(null);
  // True only in the brief window between the "+" being clicked and the initial categories fetch
  // resolving - deciding "log" vs. "create-category" depends on undiscoveredCategories, which is
  // meaningless before that fetch completes (every category would look "undiscovered" against an
  // empty array, wrongly implying there are none to log yet). QuickAddFab dispatches this click
  // the instant it's pressed, with no menu in between to absorb the wait the way it used to (see
  // docs/log/19-medication-to-category.md) - a real race that surfaced as e2e flakiness, not just
  // a hypothetical one. Deferring the decision here (rather than opening in the wrong mode) is
  // what fixes it, without needing QuickAddFab to know anything about this section's own loading
  // state.
  const [pendingAdd, setPendingAdd] = useState(false);
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();

  useEffect(() => {
    let cancelled = false;
    apiFetch<DashboardCategory[]>("/api/categories")
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

  const categoriesWithLogs = useMemo(
    () =>
      categories
        .filter((c) => c.lastLoggedAt !== null)
        .sort((a, b) => (b.lastLoggedAt as string).localeCompare(a.lastLoggedAt as string)),
    [categories],
  );

  // What the discovery panel's own picker offers - categories that don't already have their own
  // card. Once every visible category has been logged at least once, there's nothing left to
  // "discover" by logging, only by defining a brand-new one.
  const undiscoveredCategories = useMemo(
    () => categories.filter((c) => c.lastLoggedAt === null),
    [categories],
  );

  const handleAddButtonClick = useCallback(() => {
    if (categoriesLoading) {
      setPendingAdd(true);
      return;
    }
    setCategoryToPreselect(null);
    setDiscoveryFormMode(undiscoveredCategories.length === 0 ? "create-category" : "log");
  }, [categoriesLoading, undiscoveredCategories.length]);

  // Resolves a click that arrived before the initial fetch finished - see pendingAdd's own
  // comment above.
  useEffect(() => {
    if (categoriesLoading || !pendingAdd) return;
    setPendingAdd(false);
    setCategoryToPreselect(null);
    setDiscoveryFormMode(undiscoveredCategories.length === 0 ? "create-category" : "log");
  }, [categoriesLoading, pendingAdd, undiscoveredCategories.length]);

  // Lets QuickAddFab's "+" open this discovery flow directly - see dashboardQuickAddEvent.ts.
  useEffect(() => listenForDashboardQuickAdd(handleAddButtonClick), [handleAddButtonClick]);

  function handleCategoryCreated(category: Category) {
    setCategories((prev) =>
      [...prev, { ...category, hidden: false, lastLoggedAt: null }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setCategoryToPreselect(category.id);
    setDiscoveryFormMode("log");
  }

  function handleDiscoveryLogSaved(log: CategoryLog) {
    // Promotes this category into its own card immediately - driven purely by lastLoggedAt
    // turning non-null, not a separate fetch.
    setCategories((prev) =>
      prev.map((c) => (c.id === log.categoryId ? { ...c, lastLoggedAt: log.loggedAt } : c)),
    );
    setDiscoveryFormMode("closed");
    setCategoryToPreselect(null);
    showSavedMessage("Entry saved.");
    dispatchDashboardEntryChanged();
  }

  function handleDiscoveryFormCancel() {
    setDiscoveryFormMode("closed");
    setCategoryToPreselect(null);
  }

  function handleCardEmptied(categoryId: string) {
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, lastLoggedAt: null } : c)),
    );
  }

  const modalTitle =
    discoveryFormMode === "create-category"
      ? categories.length === 0
        ? "Create your first category"
        : "Create a new category"
      : "Log an entry";

  return (
    <>
      <SectionPanel
        title="Log a category"
        storageKey="category-discovery"
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
            (e.g. Water intake, Reading, Sleep) beyond medications.
          </p>
        )}
        {!categoriesLoading && !loadError && categories.length > 0 && (
          <p className="text-text-muted">
            {undiscoveredCategories.length > 0
              ? "Log a category you haven't tracked yet, or define a new one — once you log it, it gets its own card below."
              : "Every category you can see already has its own card below — use the button above to define a new one."}
          </p>
        )}
      </SectionPanel>

      {categoriesWithLogs.map((category) => (
        <CategoryLogCard
          key={category.id}
          category={category}
          onEmptied={() => handleCardEmptied(category.id)}
        />
      ))}

      <Modal
        open={discoveryFormMode !== "closed"}
        onClose={handleDiscoveryFormCancel}
        title={modalTitle}
      >
        {discoveryFormMode === "log" && (
          <CategoryEntryForm
            key={categoryToPreselect ?? "create"}
            categories={undiscoveredCategories}
            initialCategoryId={categoryToPreselect}
            onSaved={handleDiscoveryLogSaved}
            onCancel={handleDiscoveryFormCancel}
            onAddCategory={() => setDiscoveryFormMode("create-category")}
          />
        )}
        {discoveryFormMode === "create-category" && (
          <CategoryCreateForm
            onCreated={handleCategoryCreated}
            onCancel={() =>
              setDiscoveryFormMode(undiscoveredCategories.length === 0 ? "closed" : "log")
            }
          />
        )}
      </Modal>
    </>
  );
}

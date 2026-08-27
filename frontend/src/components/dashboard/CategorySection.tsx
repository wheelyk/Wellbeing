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
// Logging any category - whether or not it already has its own card - goes through one small,
// always-present "Log a category" panel below too, reachable from QuickAddFab's "+" exactly as
// before; saving through it either promotes that category into its own card (first time logged)
// or refreshes its existing one (see the CategoryLogCard `key` comment below for how), by
// updating its lastLoggedAt locally rather than re-fetching the whole category list. This picker
// used to be restricted to only "undiscovered" (not-yet-carded) categories - removed after direct
// user feedback that logging an already-carded category (e.g. a repeat "Headache" entry) from
// this shared entry point, rather than hunting for that specific card's own "+", was the more
// natural flow in practice.
export function CategorySection() {
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [discoveryFormMode, setDiscoveryFormMode] = useState<DiscoveryFormMode>("closed");
  // Set only right after CategoryCreateForm succeeds, so the log form that follows opens with the
  // category the user just defined already selected instead of defaulting to categories[0].
  const [categoryToPreselect, setCategoryToPreselect] = useState<string | null>(null);
  // True only in the brief window between the "+" being clicked and the initial categories fetch
  // resolving - deciding "log" vs. "create-category" depends on `categories`, which is
  // meaningless before that fetch completes (an empty array would wrongly look like "no
  // categories exist yet," routing straight to category creation instead of the log picker).
  // QuickAddFab dispatches this click the instant it's pressed, with no menu in between to absorb
  // the wait the way it used to (see docs/log/19-medication-to-category.md) - a real race that
  // surfaced as e2e flakiness, not just a hypothetical one. Deferring the decision here (rather
  // than opening in the wrong mode) is what fixes it, without needing QuickAddFab to know
  // anything about this section's own loading state.
  const [pendingAdd, setPendingAdd] = useState(false);
  // Bumped for a category's id every time the shared discovery picker (not that category's own
  // "+") saves a log for it - see the CategoryLogCard `key` comment below for why this exists and
  // why lastLoggedAt itself can't be used for the same purpose.
  const [discoveryRefreshTokens, setDiscoveryRefreshTokens] = useState<Record<string, number>>({});
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

  const handleAddButtonClick = useCallback(() => {
    if (categoriesLoading) {
      setPendingAdd(true);
      return;
    }
    setCategoryToPreselect(null);
    setDiscoveryFormMode(categories.length === 0 ? "create-category" : "log");
  }, [categoriesLoading, categories.length]);

  // Resolves a click that arrived before the initial fetch finished - see pendingAdd's own
  // comment above.
  useEffect(() => {
    if (categoriesLoading || !pendingAdd) return;
    setPendingAdd(false);
    setCategoryToPreselect(null);
    setDiscoveryFormMode(categories.length === 0 ? "create-category" : "log");
  }, [categoriesLoading, pendingAdd, categories.length]);

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
    // Forces CategoryLogCard to remount even if this category already had its own card - see the
    // `key` comment below. Deliberately not derived from log.loggedAt: that value defaults to
    // "now" truncated to the minute and is user-editable, so two saves within the same clock
    // minute would otherwise produce the exact same key and silently skip the remount.
    setDiscoveryRefreshTokens((prev) => ({
      ...prev,
      [log.categoryId]: (prev[log.categoryId] ?? 0) + 1,
    }));
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
            Log any category here, or define a new one — a category you log for the first time gets
            its own card below.
          </p>
        )}
      </SectionPanel>

      {categoriesWithLogs.map((category) => (
        <CategoryLogCard
          // Includes discoveryRefreshTokens, not just the category's own id - the discovery
          // picker below can now log an entry for a category that already has its own card (see
          // its own comment on why this isn't restricted to "undiscovered" categories anymore),
          // which this card's own independent fetch has no other way of finding out about.
          // Changing this key forces React to fully remount (and therefore refetch) this specific
          // card the instant that happens, rather than leaving it silently stale until the next
          // reload.
          key={`${category.id}-${discoveryRefreshTokens[category.id] ?? 0}`}
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
            categories={categories}
            initialCategoryId={categoryToPreselect}
            onSaved={handleDiscoveryLogSaved}
            onCancel={handleDiscoveryFormCancel}
            onAddCategory={() => setDiscoveryFormMode("create-category")}
          />
        )}
        {discoveryFormMode === "create-category" && (
          <CategoryCreateForm
            onCreated={handleCategoryCreated}
            onCancel={() => setDiscoveryFormMode(categories.length === 0 ? "closed" : "log")}
          />
        )}
      </Modal>
    </>
  );
}

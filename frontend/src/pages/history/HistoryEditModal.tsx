import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { CategoryEntryForm, type CategoryLog } from "../../components/CategoryEntryForm";
import type { Category } from "../../components/CategoryCreateForm";
import type { HistoryEntry } from "../HistoryPage";
import { fetchCategories, fetchCategoryLog, categoryLabel } from "./historyLogApi";

interface HistoryEditModalProps {
  // null means "closed" - same convention as HistoryPage's own deletingEntry state, so the
  // Modal underneath can key its open/closed state directly off whether there's an entry to
  // show rather than a separate boolean that could drift out of sync with it.
  entry: HistoryEntry | null;
  onClose: () => void;
  onSaved: (updated: HistoryEntry) => void;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; view: ReadyView };

interface ReadyView {
  log: CategoryLog;
  categories: Category[];
}

// Renders History's own pre-filled edit dialog - fetches the full structured record
// /api/category-logs owns (see historyLogApi.ts for why the unified history list alone isn't
// enough to pre-fill a form), then hands it to the exact same CategoryEntryForm component the
// Dashboard's own CategoryLogCard already uses in edit mode (it already supports an `editingLog`
// prop for this). Mood, Habit, Symptom, and Medication each had their own branch here too until
// Phase 17 and Phase 19 folded all four into Category - every history entry goes through this one
// path now, not a per-type branch.
// This used to be a fully self-contained, ~800-line duplicate of the Dashboard's own forms - built
// that way deliberately while a parallel workstream was also editing the Section components, to
// avoid a guaranteed merge conflict (see the implementation log entry on the design-review-driven
// History edit-parity task). Consolidated back onto the shared form once both pieces of work had
// landed, which is what this file (and historyLogApi.ts) now does.
export function HistoryEditModal({ entry, onClose, onSaved }: HistoryEditModalProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const [log, categories] = await Promise.all([
          fetchCategoryLog(entry.id, entry.loggedAt),
          fetchCategories(),
        ]);
        if (!log) throw new Error("Category log not found");
        if (!cancelled) setState({ status: "ready", view: { log, categories } });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Modal open={!!entry} onClose={onClose} title="Edit entry">
      {state.status === "loading" && <p className="text-text-muted">Loading…</p>}
      {state.status === "error" && (
        <div>
          <p role="alert" className="text-danger">
            Couldn&apos;t load this entry. Please try again.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
      {state.status === "ready" && (
        <CategoryEntryForm
          editingLog={state.view.log}
          categories={state.view.categories}
          onCancel={onClose}
          // This is always an edit here, so CategoryEntryForm's own "+ Add a new category" escape
          // hatch never renders - the callback is required by the prop type but never invoked.
          onAddCategory={() => {}}
          onSaved={(log) => {
            const category =
              state.status === "ready"
                ? state.view.categories.find((c) => c.id === log.categoryId)
                : undefined;
            onSaved({
              id: log.id,
              label: categoryLabel(category?.name ?? "Category", log, {
                valueType: category?.valueType ?? "numeric",
                scaleMax: category?.scaleMax ?? null,
              }),
              notes: log.notes,
              loggedAt: log.loggedAt,
            });
          }}
        />
      )}
    </Modal>
  );
}

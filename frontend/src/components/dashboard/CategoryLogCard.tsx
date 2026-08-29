import { useEffect, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { CategoryEntryForm, type CategoryLog } from "../CategoryEntryForm";
import { FollowUpPrompt } from "../FollowUpPrompt";
import type { Category } from "../CategoryCreateForm";
import { SectionPanel } from "./SectionPanel";
import { apiFetch } from "../../api/client";
import { formatEntryDateTime } from "../../lib/entryDateLabel";
import { useTimedMessage } from "../../hooks/useTimedMessage";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

// Mirrors every other Section's own PAGE_SIZE/offset-pagination shape.
const PAGE_SIZE = 10;

interface CategoryLogPage {
  entries: CategoryLog[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Same value-formatting CategorySection's own merged list used - kept here too since each card
// now renders its own list independently rather than one shared one.
function formatCategoryLogValue(log: CategoryLog, category: Category): string {
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

interface CategoryLogCardProps {
  category: Category;
  // Called once this card's own history becomes genuinely empty (its last remaining entry was
  // just deleted, with no further page behind it) - lets CategorySection drop this category back
  // out of the "has its own card" list immediately, matching the same "only shown once logged"
  // rule its *appearance* already follows, rather than leaving a lingering empty card until the
  // next full reload.
  onEmptied: () => void;
}

// One dedicated "Recent <name>" Dashboard card per category the caller has actually logged at
// least once - mirrors MedicationSection's own shape (own fetch/pagination/form/SectionPanel),
// rendered as a sibling grid card by CategorySection (Phase 18) instead of one shared card mixing
// every category's entries together. Its own "+" opens CategoryEntryForm locked to just this one
// category (hideCategoryPicker) - no picker, since there's only ever one possible category here.
export function CategoryLogCard({ category, onEmptied }: CategoryLogCardProps) {
  const [logs, setLogs] = useState<CategoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLog, setEditingLog] = useState<CategoryLog | null>(null);
  const { message: savedMessage, showMessage: showSavedMessage } = useTimedMessage();
  // Set after a brand-new entry, to offer "remind me again in…" (see FollowUpPrompt). Not timed
  // like the confirmation above it: a confirmation is finished being read in a second, but an
  // offer that disappears while someone is deciding is worse than one that waits to be dismissed.
  const [offerFollowUp, setOfferFollowUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CategoryLogPage>(
      `/api/category-logs?categoryId=${category.id}&limit=${PAGE_SIZE}&offset=0`,
    )
      .then((page) => {
        if (cancelled) return;
        setLogs(page.entries);
        setHasMore(page.hasMore);
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
  }, [category.id]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const page = await apiFetch<CategoryLogPage>(
        `/api/category-logs?categoryId=${category.id}&limit=${PAGE_SIZE}&offset=${logs.length}`,
      );
      setLogs((prev) => [...prev, ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleLoadLess() {
    setLogs((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  function handleSaved(log: CategoryLog) {
    let wasEdit = false;
    setLogs((prev) => {
      wasEdit = prev.some((l) => l.id === log.id);
      return wasEdit ? prev.map((l) => (l.id === log.id ? log : l)) : [log, ...prev];
    });
    setShowForm(false);
    setEditingLog(null);
    // Only for a new entry. Correcting last Tuesday's reading is not a reason to be reminded
    // about anything this afternoon.
    setOfferFollowUp(!wasEdit);
    showSavedMessage("Entry saved.");
    dispatchDashboardEntryChanged();
  }

  function handleEdit(log: CategoryLog) {
    setEditingLog(log);
    setShowForm(true);
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingLog(null);
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this entry? This can't be undone.");
    if (!confirmed) return;

    const previous = logs;
    const next = previous.filter((log) => log.id !== id);
    setLogs(next);
    try {
      await apiFetch(`/api/category-logs/${id}`, { method: "DELETE" });
      dispatchDashboardEntryChanged();
      if (next.length === 0 && !hasMore) {
        onEmptied();
      }
    } catch {
      setLogs(previous);
    }
  }

  return (
    <>
      <SectionPanel
        title={`Recent ${category.icon ? `${category.icon} ` : ""}${category.name}`}
        storageKey={`category-${category.id}`}
        addLabel={`Add ${category.name} entry`}
        onAddClick={() => {
          setEditingLog(null);
          setShowForm(true);
        }}
      >
        {savedMessage && (
          <p role="status" className="mb-3 text-sm font-medium text-success">
            {savedMessage}
          </p>
        )}
        {offerFollowUp && (
          <FollowUpPrompt
            categoryId={category.id}
            categoryName={category.name}
            onDismiss={() => setOfferFollowUp(false)}
          />
        )}
        {loading && <p className="text-text-muted">Loading…</p>}
        {loadError && (
          <p role="alert" className="text-danger">
            Couldn&apos;t load {category.name}. Please try refreshing.
          </p>
        )}
        {!loading && !loadError && logs.length === 0 && (
          <p className="text-text-muted">
            Nothing logged yet — use the button above to record an entry.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted p-4"
            >
              <div>
                <p className="text-text">{formatCategoryLogValue(log, category)}</p>
                {log.notes && <p className="text-sm text-text-muted">{log.notes}</p>}
                <p className="text-xs text-text-muted">{formatEntryDateTime(log.loggedAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleEdit(log)}
                  aria-label={`Edit entry from ${formatEntryDateTime(log.loggedAt)}`}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDelete(log.id)}
                  aria-label={`Delete entry from ${formatEntryDateTime(log.loggedAt)}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && !loadError && (hasMore || logs.length > PAGE_SIZE) && (
          <div className="mt-4 flex justify-center gap-2">
            {hasMore && (
              <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
            {logs.length > PAGE_SIZE && (
              <Button variant="secondary" onClick={handleLoadLess}>
                Load less
              </Button>
            )}
          </div>
        )}
      </SectionPanel>
      <Modal
        open={showForm}
        onClose={handleFormCancel}
        title={editingLog ? "Edit entry" : `Log ${category.name}`}
      >
        <CategoryEntryForm
          key={editingLog?.id ?? "create"}
          categories={[category]}
          initialCategoryId={category.id}
          hideCategoryPicker
          editingLog={editingLog}
          onSaved={handleSaved}
          onCancel={handleFormCancel}
          onAddCategory={() => {}}
        />
      </Modal>
    </>
  );
}

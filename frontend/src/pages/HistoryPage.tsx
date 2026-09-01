import { useEffect, useState, type ReactNode } from "react";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { CollapsibleSection, Chevron } from "../components/CollapsibleSection";
import { useCollapsedState } from "../hooks/useCollapsedState";
import { apiFetch } from "../api/client";
import type { Category } from "../components/CategoryCreateForm";
import { HistoryEditModal } from "./history/HistoryEditModal";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
import { categoryLogValueTone } from "../lib/timeline";

// categoryName/categoryIcon/value are separate fields, not one pre-joined "Name: value" string -
// see backend/src/routes/history.ts's own comment on why (docs/log/53-history-redesign.md). This
// is what lets a row render the way a Timeline reminder row already does: the name as the row's
// own text, the value as its own pill.
export interface HistoryEntry {
  id: string;
  categoryName: string;
  categoryIcon: string | null;
  value: string;
  notes: string | null;
  loggedAt: string;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

// The backend's unified /api/history endpoint is read-only, so deleting goes through
// /api/category-logs directly - the same endpoint the Dashboard's own CategoryLogCard already
// uses for its own delete action. Medication used to be a second, independent DELETE target here
// until it unified into Category (Phase 19, see docs/log/19-medication-to-category.md) - every
// history entry is a category log now.
const DELETE_PATH = "/api/category-logs";

// A stable, locale-independent grouping key (unlike a formatted display string, which can
// vary by locale/timezone in ways that would make two entries on the same calendar day sort
// into different groups). Built from the browser's local date parts, not the raw UTC instant,
// so "today" groups correctly regardless of the viewer's timezone.
function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateHeading(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Groups an already-sorted (most-recent-first) flat list into per-day buckets, preserving
// order - a plain Map keeps insertion order, so the first entry seen for a given day decides
// where that day's group appears in the overall list.
function groupByDate(entries: HistoryEntry[]): Array<{ key: string; entries: HistoryEntry[] }> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = dateKey(entry.loggedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return Array.from(groups.entries()).map(([key, groupEntries]) => ({
    key,
    entries: groupEntries,
  }));
}

function buildQuery(filters: { from: string; to: string; categoryId: string }, offset: number) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

// Green means the same thing Timeline's own "Logged" pill already does - the thing happened.
// Everything else (an explicit "Not done", or a plain recorded number) stays neutral: a real
// answer isn't a failure just because it's a pill, and a raw value has no good/bad reading of its
// own the way an outcome does (see docs/log/53-history-redesign.md's own Decisions). The
// success/neutral decision itself now lives in lib/timeline.ts's categoryLogValueTone - Timeline's
// own unscheduled-category-log row needed the identical rule (see docs/log/55-timeline-shows-all-
// logged.md), and this was the second real use that justified pulling it out rather than keeping
// two copies in sync by hand. The Tailwind class map stays local - it's the one part that's
// genuinely per-page (Timeline's row and History's row don't have to share pixel-identical
// styling, just the same underlying tone decision).
const HISTORY_VALUE_TONE: Record<ReturnType<typeof categoryLogValueTone>, string> = {
  success: "border-success/50 bg-success/10 text-success",
  neutral: "border-border bg-surface text-text-muted",
};

// Timeline's own day divider (thin rule, centered pill, thin rule - see TimelinePanel.tsx) has no
// reason to collapse: it only ever shows one day at a time. History spans weeks, so per-day
// collapse (see the "collapses one date group" test below) is worth keeping - this borrows
// Timeline's visual shape and adds a count and a chevron to it, rather than dropping collapse to
// match Timeline exactly. useCollapsedState is the same hook CollapsibleSection itself uses, so
// this participates in the same "collapse all" broadcast and localStorage persistence every other
// disclosure in the app already has, just under a header shaped too differently from
// CollapsibleSection's own (icon-title-badge-subtitle-meta-chevron, always left-to-right) for that
// component to render directly - there's no prop combination that produces two flex-1 rules either
// side of a centered pill.
function DayGroupDivider({
  dayKey,
  label,
  count,
  children,
}: {
  dayKey: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { collapsed, toggle } = useCollapsedState(`history.${dayKey}`, false);
  const contentId = `history-day-${dayKey}`;

  return (
    <div className="mt-6 first:mt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
          {/* A real heading, not just styled to look like one - narrower than the page's own
              h1, matching every other per-day heading this page has always had. */}
          <h2 className="inline text-[11px] font-semibold tracking-wide uppercase">{label}</h2>
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="shrink-0 text-xs tabular-nums text-text-muted">{count}</span>
        <Chevron collapsed={collapsed} size="md" />
      </button>
      {!collapsed && (
        <ul id={contentId} className="mt-2 flex flex-col gap-2">
          {children}
        </ul>
      )}
    </div>
  );
}

// A row shaped exactly like Timeline's own reminder row (see ReminderRow in TimelinePanel.tsx):
// leading time, name (with its category's icon, when it has one) and notes as a detail line, a
// state pill, then row actions as trailing siblings. Edit/Delete are small circular icon buttons
// - the same restrained sizing Timeline's own row-level "+" and checkbox already use - rather than
// the full-sized, bordered Button/ActionButton pair this row used before, which visually competed
// with the row's own content instead of sitting quietly beside it. Icon-only at every width
// (title="" stands in for the label ActionButton used to show from `sm:` up), matching how
// Timeline's own icon buttons work at every width too - the accessible name (name= before this
// change, aria-label now) is unchanged either way, so this is a visual restyle only.
function HistoryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: HistoryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const time = new Date(entry.loggedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const loggedAtText = new Date(entry.loggedAt).toLocaleString();

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2">
      <span className="shrink-0 text-sm font-medium tabular-nums text-text">{time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text">
          {entry.categoryIcon ? `${entry.categoryIcon} ` : ""}
          {entry.categoryName}
        </span>
        {entry.notes && (
          <span className="block truncate text-xs text-text-muted">{entry.notes}</span>
        )}
      </span>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums ${HISTORY_VALUE_TONE[categoryLogValueTone(entry.value)]}`}
      >
        {entry.value}
      </span>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onEdit}
          title="Edit"
          aria-label={`Edit entry from ${loggedAtText}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden="true">✎</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete entry from ${loggedAtText}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:border-danger hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden="true">🗑</span>
        </button>
      </span>
    </li>
  );
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // "" means "All categories" - not a real category id, so it's never sent as a query param
  // (see buildQuery's own `if (filters.categoryId)` check).
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // null means "closed" for both - see HistoryEditModal/ConfirmDeleteModal's own comments on
  // this convention.
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<HistoryEntry | null>(null);

  // Fetched once, independently of the entries themselves - the same default (non-hidden)
  // visibility GET /api/categories already gives Dashboard/Quick Add, so a category the user has
  // hidden doesn't clutter this filter either (its own past entries are still reachable via the
  // date-range filter instead, the same "browse via date range" escape hatch a since-archived
  // personal category already relies on).
  useEffect(() => {
    let cancelled = false;
    apiFetch<Category[]>("/api/categories")
      .then((res) => {
        if (!cancelled) setCategories(res);
      })
      .catch(() => {
        // A failed categories fetch only degrades the filter (no options beyond "All
        // categories") - the entries list itself has its own independent load/error state, so
        // this doesn't block the page from being useful.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetches from the beginning (offset 0) whenever a filter changes - a filter change means
  // the previously-loaded pages no longer reflect the current query, so they can't just be kept
  // around and appended to.
  useEffect(() => {
    let cancelled = false;

    function load() {
      setLoading(true);
      setLoadError(false);
      apiFetch<HistoryResponse>(`/api/history?${buildQuery({ from, to, categoryId }, 0)}`)
        .then((res) => {
          if (cancelled) return;
          setEntries(res.entries);
          setHasMore(res.hasMore);
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    // Refetches whenever this tab becomes visible again - the general fix for a request landing
    // mid-deploy and getting served whichever shape the backend happened to be running at that
    // exact instant (see docs/log/52-timeline-sync.md, which added the identical fix to
    // TimelinePanel.tsx for the same reason: a same-window "something changed" event was never
    // going to catch this, since nothing about this page's own data changed - the *server*
    // changed underneath an already-loaded page). Concretely: GET /api/history's own response
    // shape changed under docs/log/53-history-redesign.md (a pre-joined `label` string split into
    // categoryName/categoryIcon/value) - a request that landed on Railway before that deploy
    // finished still returned a real 200, just in the old shape, which the new frontend then
    // rendered as blank name/value text rather than an error, since nothing here previously
    // checked that the fields it expected were actually present. Backgrounding and refocusing the
    // tab (or simply reloading) picks up the real, by-then-finished deploy automatically.
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [from, to, categoryId]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const res = await apiFetch<HistoryResponse>(
        `/api/history?${buildQuery({ from, to, categoryId }, entries.length)}`,
      );
      setEntries((prev) => [...prev, ...res.entries]);
      setHasMore(res.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Purely local, same reasoning as the Dashboard's own per-type sections' handleLoadLess - the
  // extra pages are already sitting in `entries`, so collapsing back to the first one doesn't
  // need a network round-trip, and hasMore is always true afterward since showing "Load less" at
  // all already implies more than PAGE_SIZE entries were fetched.
  function handleLoadLess() {
    setEntries((prev) => prev.slice(0, PAGE_SIZE));
    setHasMore(true);
  }

  // Delete now goes through a real confirmation dialog (ConfirmDeleteModal, built from this
  // app's own Modal component) instead of window.confirm - handleRequestDelete just opens it;
  // the actual optimistic-delete-with-rollback logic (unchanged from before) lives in
  // handleConfirmDelete, run only once the user confirms in that dialog.
  function handleRequestDelete(entry: HistoryEntry) {
    setDeletingEntry(entry);
  }

  async function handleConfirmDelete() {
    const entry = deletingEntry;
    if (!entry) return;
    setDeletingEntry(null);

    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await apiFetch(`${DELETE_PATH}/${entry.id}`, { method: "DELETE" });
    } catch {
      setEntries(previous);
    }
  }

  // Called by HistoryEditModal once a PATCH succeeds - updates the matching entry in place so the
  // change is visible immediately without a full refetch of /api/history.
  function handleEntrySaved(updated: HistoryEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingEntry(null);
  }

  const groups = groupByDate(entries);

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* pb-24/md:pb-8 - see DashboardPage.tsx's equivalent comment: leaves room below `md:` for
          the fixed BottomNav bar so the last entry (or the Load more button) isn't hidden
          behind it. max-w-3xl on mobile matches every other page; md:max-w-4xl/lg:max-w-5xl
          widen the container from there - unlike Dashboard/Trends, History's content is a single
          chronological list with no natural second column, so this doesn't add a grid the way
          those pages' equivalent widening does, but a UI review flagged the page as stranding
          real desktop width unused even so (a narrow single column with a lot of empty space on
          either side isn't "intentional," it's just unfinished). Widening the container still
          gives the filter row and each entry card more breathing room even with one column. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:max-w-4xl md:pb-8 lg:max-w-5xl">
        <h1 className="text-2xl font-semibold text-text">History</h1>
        <p className="mt-2 text-text-muted">Browse everything you&apos;ve logged.</p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <CollapsibleSection title="Filters" storageKey="history.filters">
            {/* Stacked, full-width fields on mobile (easy to tap, no cramped side-by-side date
                inputs on a narrow screen); a single horizontal row from sm: up, once there's
                actually room for fields side by side without wrapping unpredictably - see
                the implementation log entry on this app's mobile-first pass. This replaces
                relying on flex-wrap's own default wrapping point (which happened to look
                reasonable before, but wasn't a deliberate breakpoint decision - just wherever the
                fields' natural widths happened to overflow). */}
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="history-category-filter" className="text-sm font-medium text-text">
                  Category
                </label>
                <select
                  id="history-category-filter"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.icon ? `${category.icon} ` : ""}
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="history-from" className="text-sm font-medium text-text">
                  From
                </label>
                <input
                  id="history-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="history-to" className="text-sm font-medium text-text">
                  To
                </label>
                <input
                  id="history-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
              </div>

              {(categoryId || from || to) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCategoryId("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </CollapsibleSection>
        </div>

        <section className="mt-6">
          {loading && <p className="text-text-muted">Loading…</p>}
          {loadError && (
            <p role="alert" className="text-danger">
              Couldn&apos;t load your history. Please try refreshing.
            </p>
          )}
          {!loading && !loadError && entries.length === 0 && (
            <p className="text-text-muted">
              Nothing to show yet — entries you log from the Dashboard will show up here.
            </p>
          )}

          {!loading &&
            !loadError &&
            groups.map((group) => (
              <DayGroupDivider
                key={group.key}
                dayKey={group.key}
                label={dateHeading(group.key)}
                count={group.entries.length}
              >
                {group.entries.map((entry) => (
                  <HistoryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => setEditingEntry(entry)}
                    onDelete={() => handleRequestDelete(entry)}
                  />
                ))}
              </DayGroupDivider>
            ))}

          {!loading && !loadError && (hasMore || entries.length > PAGE_SIZE) && (
            <div className="mt-6 flex justify-center gap-2">
              {hasMore && (
                <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
              {entries.length > PAGE_SIZE && (
                <Button variant="secondary" onClick={handleLoadLess}>
                  Load less
                </Button>
              )}
            </div>
          )}
        </section>
      </main>
      <BottomNav />
      <HistoryEditModal
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={handleEntrySaved}
      />
      <ConfirmDeleteModal
        open={!!deletingEntry}
        title="Delete entry?"
        message={deletingEntry ? "Delete this entry? This can't be undone." : ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingEntry(null)}
      />
    </div>
  );
}

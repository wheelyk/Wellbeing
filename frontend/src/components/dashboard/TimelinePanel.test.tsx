import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelinePanel } from "./TimelinePanel";
import { apiFetch } from "../../api/client";
import { DASHBOARD_TIMELINE_ACTION_EVENT } from "../../lib/dashboardTimelineActionEvent";
import type { TimelineAction } from "../../lib/dashboardTimelineActionEvent";
import { DASHBOARD_TASK_ACTION_EVENT } from "../../lib/dashboardTaskActionEvent";
import type { TaskManagerAction } from "../../lib/dashboardTaskActionEvent";
import { dispatchDashboardEntryChanged } from "../../lib/dashboardEntryChangedEvent";

vi.mock("../../api/client", () => ({ apiFetch: vi.fn() }));
const apiFetchMock = vi.mocked(apiFetch);

// Same non-functional-localStorage workaround the other panel tests document - the collapsed
// state persists through it.
function stubWorkingLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage);
}

// Listens for the one real DOM event a row click dispatches (see
// lib/dashboardTimelineActionEvent.ts) rather than mocking the module that dispatches it - this
// is what CategoryLogger genuinely receives, and asserting against the real event catches a wiring
// mistake a mock of the dispatch function itself would not.
function captureTimelineActions(): TimelineAction[] {
  const captured: TimelineAction[] = [];
  window.addEventListener(DASHBOARD_TIMELINE_ACTION_EVENT, (event) => {
    captured.push((event as CustomEvent<TimelineAction>).detail);
  });
  return captured;
}

function captureTaskActions(): TaskManagerAction[] {
  const captured: TaskManagerAction[] = [];
  window.addEventListener(DASHBOARD_TASK_ACTION_EVENT, (event) => {
    captured.push((event as CustomEvent<TaskManagerAction>).detail);
  });
  return captured;
}

const emptyRecent = { timezone: "Europe/London", today: "2026-08-30", truncated: false, runs: [] };
const emptyUpcoming = {
  timezone: "Europe/London",
  today: "2026-08-30",
  truncated: false,
  runs: [],
};
const emptyTasks = { timezone: "Europe/London", today: "2026-08-30", tasks: [] };
const emptyHistory = { entries: [], limit: 20, offset: 0, hasMore: false };

// The panel fires four independent calls - one per endpoint (recent, upcoming, tasks, and
// GET /api/history for unscheduled category logs - see docs/log/55-timeline-shows-all-logged.md)
// - and a fifth, separate one-off probe (also against /recent, at a fixed days=7) that decides
// which range chips are worth showing at all. Branching only on which endpoint a URL hits, not on
// its query string, means the same `recent` fixture answers both the probe and the
// currently-selected range's own fetch - which is what every test below wants anyway, since a
// fixture with a logged row in it should both reveal the wider chips *and* be what renders once
// one is picked. Tasks and history default to empty throughout - the tests specifically about
// each override it.
function mockTimelineFetch(
  overrides: { recent?: unknown; upcoming?: unknown; tasks?: unknown; history?: unknown } = {},
) {
  apiFetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/reminders/recent")) {
      return Promise.resolve(overrides.recent ?? emptyRecent);
    }
    if (url.includes("/api/reminders/upcoming")) {
      return Promise.resolve(overrides.upcoming ?? emptyUpcoming);
    }
    if (url.includes("/api/tasks")) {
      return Promise.resolve(overrides.tasks ?? emptyTasks);
    }
    if (url.includes("/api/history")) {
      return Promise.resolve(overrides.history ?? emptyHistory);
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
}

const recentWithRuns = {
  ...emptyRecent,
  runs: [
    {
      date: "2026-08-30",
      time: "08:00",
      reminderId: "r-logged",
      target: "category",
      categoryId: "cat-anxiety",
      category: { name: "Anxiety", icon: "🧠" },
      state: "logged" as const,
      logId: "log-anxiety-1",
    },
    {
      date: "2026-08-30",
      time: "09:00",
      reminderId: "r-missed",
      target: "category",
      categoryId: "cat-diazepam",
      category: { name: "Diazepam", icon: "💊" },
      state: "missed" as const,
      logId: null,
    },
  ],
};

const upcomingWithRuns = {
  ...emptyUpcoming,
  runs: [
    {
      date: "2026-08-30",
      time: "12:00",
      reminderId: "r-logged-future",
      target: "category",
      categoryId: "cat-sertraline",
      category: { name: "Sertraline", icon: "💊" },
      state: "logged" as const,
    },
    {
      date: "2026-08-31",
      time: "03:46",
      reminderId: "r-held",
      target: "category",
      categoryId: "cat-water",
      category: { name: "Water", icon: "💧" },
      state: "held" as const,
      deliveredAt: "08:00",
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  stubWorkingLocalStorage();
  apiFetchMock.mockReset();
  mockTimelineFetch();
  // jsdom's own default - reset explicitly since the visibilitychange tests below override it.
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("TimelinePanel", () => {
  it("asks all four endpoints for the same range by default, plus the fixed probe", async () => {
    render(<TimelinePanel />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=1");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=1");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/tasks?days=1");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/history?days=1");
      // The probe always asks the widest window, independently of whatever range is selected -
      // it exists purely to decide which chips are worth offering.
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=7");
    });
  });

  // The point of the merge: a past row and a future row on the same calendar day land in one
  // "Today" group, not two - which only holds together if the NOW divider actually sits between
  // them, in whichever direction the current order reads.
  it("defaults to newest first: future above NOW, past below it, within Today", async () => {
    mockTimelineFetch({ recent: recentWithRuns, upcoming: upcomingWithRuns });
    render(<TimelinePanel />);

    expect(await screen.findByText("🧠 Anxiety")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newest first" })).toBeInTheDocument();
    // Scoped to the day-group heading specifically, not the range chip that also happens to be
    // labelled "Today" - two day-groups both saying "Today" would mean the merge failed to
    // collapse past and future rows into one section.
    expect(screen.getAllByText("Today")).toHaveLength(2); // range chip + day heading
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("NOW")).toBeInTheDocument();

    // Future (Sertraline), then NOW, then past (Anxiety) - newest-first's own reading order.
    const anxietyRow = screen.getByText("🧠 Anxiety").closest("li") as HTMLElement;
    const now = screen.getByText("NOW");
    const sertralineRow = screen.getByText("💊 Sertraline").closest("li") as HTMLElement;

    expect(
      sertralineRow.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(now.compareDocumentPosition(anxietyRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("flips to oldest first on request, reversing which side of NOW each row lands on", async () => {
    mockTimelineFetch({ recent: recentWithRuns, upcoming: upcomingWithRuns });
    render(<TimelinePanel />);
    await screen.findByText("🧠 Anxiety");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Newest first" }));

    expect(await screen.findByRole("button", { name: "Oldest first" })).toBeInTheDocument();
    const anxietyRow = screen.getByText("🧠 Anxiety").closest("li") as HTMLElement;
    const now = screen.getByText("NOW");
    const sertralineRow = screen.getByText("💊 Sertraline").closest("li") as HTMLElement;

    // Past (Anxiety) above NOW, future (Sertraline) below it - the original order this app
    // launched with, still available via the toggle.
    expect(anxietyRow.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      now.compareDocumentPosition(sertralineRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows a missed dose plainly, distinct from one that was logged", async () => {
    mockTimelineFetch({ recent: recentWithRuns });
    render(<TimelinePanel />);

    expect(await screen.findByText("Missed")).toBeInTheDocument();
    expect(screen.getByText("No dose logged that day")).toBeInTheDocument();
    // The pill legitimately says "Logged" - what must NOT also appear is the future-only prose
    // explanation ("Already logged, so this one won't fire"), which would be redundant here: the
    // pill and the row's own place in the past already say the same thing.
    expect(screen.getByText("🧠 Anxiety").closest("li")).not.toHaveTextContent("Already logged");
  });

  it("explains why a future run silenced by an earlier log today will not fire", async () => {
    mockTimelineFetch({ upcoming: upcomingWithRuns });
    render(<TimelinePanel />);

    expect(await screen.findByText("Already logged, so this one won't fire")).toBeInTheDocument();
  });

  // "Held" has to say when it will actually arrive - "Held" alone reads as "you won't get it",
  // when the scheduler genuinely defers rather than drops it.
  it("says when a held run will actually arrive", async () => {
    mockTimelineFetch({ upcoming: upcomingWithRuns });
    render(<TimelinePanel />);

    expect(await screen.findByText("Held")).toBeInTheDocument();
    expect(screen.getByText("Quiet hours — arrives at 08:00")).toBeInTheDocument();
  });

  it("re-asks every endpoint with the new range when it changes", async () => {
    // A logged row today is enough to make every chip available (see hasLoggedWithinDays).
    mockTimelineFetch({ recent: recentWithRuns });
    render(<TimelinePanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "7 days" }));

    // Re-fetched rather than filtered client-side: the client has no way to know what happened
    // or will happen beyond the window it asked for.
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=7");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=7");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/tasks?days=7");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/history?days=7");
    });
  });

  it("refetches immediately when any Dashboard section reports an entry changed", async () => {
    render(<TimelinePanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/api/tasks?days=1"));
    const callsBefore = apiFetchMock.mock.calls.length;

    dispatchDashboardEntryChanged();

    // A genuine second pass over all three endpoints, not just the range-chip probe (which
    // already listened for this event before Tasks existed) - see TimelinePanel's own comment on
    // this being a real, pre-existing gap Tasks closed rather than something Tasks specifically
    // needed.
    await waitFor(() => expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=1");
  });

  // A change made from a different tab (a reminder deleted on Categories, open elsewhere) or
  // while this tab was backgrounded never dispatches dashboardEntryChangedEvent into *this*
  // window at all - regaining visibility is the one signal that reaches this tab regardless of
  // where or how the data actually changed.
  it("refetches when the tab becomes visible again, regardless of what changed elsewhere", async () => {
    render(<TimelinePanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/api/tasks?days=1"));
    const callsBefore = apiFetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=1");
  });

  it("does not refetch on a visibilitychange that leaves the tab hidden", async () => {
    render(<TimelinePanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/api/tasks?days=1"));
    const callsBefore = apiFetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Nothing useful to fetch while backgrounded - the point is the transition back into view,
    // not every visibility flicker.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(apiFetchMock.mock.calls.length).toBe(callsBefore);
  });

  describe("range chip visibility", () => {
    it("offers only Today when nothing has been logged in the last week", async () => {
      render(<TimelinePanel />);
      await screen.findByRole("group", { name: "How far to look" });

      expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "3 days" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "7 days" })).not.toBeInTheDocument();
    });

    it("offers 3 and 7 days once something was logged within the last week", async () => {
      mockTimelineFetch({ recent: recentWithRuns });
      render(<TimelinePanel />);

      expect(await screen.findByRole("button", { name: "3 days" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    });

    it("offers 7 days but not 3, for something logged 5 days back", async () => {
      const fiveDaysAgo = {
        ...emptyRecent,
        runs: [
          {
            date: "2026-08-25",
            time: "09:00",
            reminderId: "r-old",
            target: "category",
            categoryId: "cat-1",
            category: { name: "Anxiety", icon: "🧠" },
            state: "logged" as const,
            logId: "log-old",
          },
        ],
      };
      mockTimelineFetch({ recent: fiveDaysAgo });
      render(<TimelinePanel />);

      expect(await screen.findByRole("button", { name: "7 days" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "3 days" })).not.toBeInTheDocument();
    });
  });

  describe("row click actions", () => {
    it("dispatches an edit action for a past logged row", async () => {
      const captured = captureTimelineActions();
      mockTimelineFetch({ recent: recentWithRuns });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Edit Anxiety at 08:00/ }));

      expect(captured).toEqual([{ type: "edit", logId: "log-anxiety-1" }]);
    });

    it("dispatches a locked add action for a missed row", async () => {
      const captured = captureTimelineActions();
      mockTimelineFetch({ recent: recentWithRuns });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Log Diazepam for 09:00/ }));

      expect(captured).toEqual([{ type: "add", categoryId: "cat-diazepam" }]);
    });

    // The one row with nothing to do at all - already satisfied, and not "in the past" either, so
    // there is no exact entry to point an edit at (see timelineRowAction's own reasoning).
    it("renders a future logged row as plain text, not a button", async () => {
      mockTimelineFetch({ upcoming: upcomingWithRuns });
      render(<TimelinePanel />);

      const row = await screen.findByText("💊 Sertraline");
      expect(row.closest("li")?.querySelector("button")).toBeNull();
    });

    it("dispatches an unlocked add action for a GENERAL row", async () => {
      const captured = captureTimelineActions();
      mockTimelineFetch({
        upcoming: {
          ...emptyUpcoming,
          runs: [
            {
              date: "2026-08-30",
              time: "20:00",
              reminderId: "r-general",
              target: "general",
              categoryId: null,
              category: null,
              state: "scheduled" as const,
            },
          ],
        },
      });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Log an entry for 20:00/ }));

      expect(captured).toEqual([{ type: "add", categoryId: null }]);
    });
  });

  describe("tasks", () => {
    // `kind: "task"` included here even though GET /api/tasks itself never sends it - TimelinePanel
    // adds it while merging (see mergeWithTasks), so the object a row click actually dispatches
    // carries it too. Including it in the fixture keeps these tests' own `toEqual` calls exact
    // rather than needing `objectContaining` to tolerate a field the real flow always adds.
    const overdueTask = {
      kind: "task" as const,
      id: "task-vet",
      title: "Phone the vet",
      notes: "ask about the booster",
      date: "2026-08-30",
      time: "12:30",
      dueAt: "2026-08-30T12:30:00.000Z",
      state: "overdue" as const,
      when: "past" as const,
    };
    const upcomingTask = {
      kind: "task" as const,
      id: "task-parcel",
      title: "Pick up parcel",
      notes: null,
      date: "2026-08-30",
      time: "20:00",
      dueAt: "2026-08-30T20:00:00.000Z",
      state: "upcoming" as const,
      when: "future" as const,
    };

    it("renders a task row with its Task tag, notes, and state pill", async () => {
      mockTimelineFetch({ tasks: { ...emptyTasks, tasks: [overdueTask] } });
      render(<TimelinePanel />);

      expect(await screen.findByText("Phone the vet")).toBeInTheDocument();
      expect(screen.getByText("Task")).toBeInTheDocument();
      expect(screen.getByText("ask about the booster")).toBeInTheDocument();
      expect(screen.getByText("Overdue")).toBeInTheDocument();
    });

    it("interleaves tasks with reminder rows in the merged list", async () => {
      mockTimelineFetch({
        recent: recentWithRuns,
        tasks: { ...emptyTasks, tasks: [overdueTask] },
      });
      render(<TimelinePanel />);

      expect(await screen.findByText("Phone the vet")).toBeInTheDocument();
      expect(screen.getByText("🧠 Anxiety")).toBeInTheDocument();
      expect(screen.getByText("💊 Diazepam")).toBeInTheDocument();
    });

    it("dispatches toggleDone when the checkbox is tapped", async () => {
      const captured = captureTaskActions();
      mockTimelineFetch({ tasks: { ...emptyTasks, tasks: [overdueTask] } });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Mark Phone the vet done/ }));

      expect(captured).toEqual([{ type: "toggleDone", task: overdueTask }]);
    });

    it("dispatches edit when the row body is tapped, not the checkbox", async () => {
      const captured = captureTaskActions();
      mockTimelineFetch({ tasks: { ...emptyTasks, tasks: [overdueTask] } });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Phone the vet, due 12:30/ }));

      expect(captured).toEqual([{ type: "edit", task: overdueTask }]);
    });

    it("labels a done task's checkbox for reopening instead of marking done", async () => {
      mockTimelineFetch({
        tasks: { ...emptyTasks, tasks: [{ ...overdueTask, state: "done" as const }] },
      });
      render(<TimelinePanel />);

      expect(
        await screen.findByRole("button", { name: /Reopen Phone the vet/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("shows no state pill for an ordinary upcoming task", async () => {
      mockTimelineFetch({ tasks: { ...emptyTasks, tasks: [upcomingTask] } });
      render(<TimelinePanel />);

      expect(await screen.findByText("Pick up parcel")).toBeInTheDocument();
      expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
      expect(screen.queryByText("Done")).not.toBeInTheDocument();
    });

    it("dispatches an add action from Timeline's own header button", async () => {
      const captured = captureTaskActions();
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Add a task" }));

      expect(captured).toEqual([{ type: "add" }]);
    });
  });

  // See docs/log/55-timeline-shows-all-logged.md - a category with no reminder attached (most
  // ad-hoc symptom tracking, in practice) used to be invisible on Timeline even though it had
  // genuinely been logged that day, and only showed up on History.
  describe("category logs", () => {
    const headacheLog = {
      kind: "categoryLog" as const,
      when: "past" as const,
      id: "log-headache-1",
      categoryName: "Headache",
      categoryIcon: "🤕",
      value: "6/10",
      notes: "worse after screen time",
      loggedAt: "2026-08-30T09:00:00.000Z",
      date: "2026-08-30",
      time: "09:00",
    };

    it("renders an unscheduled category log's own row, with its notes and value pill", async () => {
      mockTimelineFetch({ history: { ...emptyHistory, entries: [headacheLog] } });
      render(<TimelinePanel />);

      expect(await screen.findByText("🤕 Headache")).toBeInTheDocument();
      expect(screen.getByText("worse after screen time")).toBeInTheDocument();
      expect(screen.getByText("6/10")).toBeInTheDocument();
    });

    it("interleaves an unscheduled category log with reminder rows in the merged list", async () => {
      mockTimelineFetch({
        recent: recentWithRuns,
        history: { ...emptyHistory, entries: [headacheLog] },
      });
      render(<TimelinePanel />);

      expect(await screen.findByText("🤕 Headache")).toBeInTheDocument();
      expect(screen.getByText("🧠 Anxiety")).toBeInTheDocument();
    });

    // The dedup case: this log's id matches the CATEGORY-target reminder's own logId in
    // recentWithRuns (see recentWithRuns above, "log-anxiety-1"), so it must not also appear as
    // its own separate row - that would show the exact same entry twice.
    it("does not duplicate a category log already shown as a reminder's own logged row", async () => {
      mockTimelineFetch({
        recent: recentWithRuns,
        history: {
          ...emptyHistory,
          entries: [
            { ...headacheLog, id: "log-anxiety-1", categoryName: "Anxiety", categoryIcon: "🧠" },
          ],
        },
      });
      render(<TimelinePanel />);

      expect(await screen.findAllByText("🧠 Anxiety")).toHaveLength(1);
    });

    it("dispatches an edit action for the exact log when its row is tapped", async () => {
      const captured = captureTimelineActions();
      mockTimelineFetch({ history: { ...emptyHistory, entries: [headacheLog] } });
      render(<TimelinePanel />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /Edit Headache at 09:00/ }));

      expect(captured).toEqual([{ type: "edit", logId: "log-headache-1" }]);
    });
  });

  it("says plainly when there is nothing on either side", async () => {
    render(<TimelinePanel />);

    expect(await screen.findByText(/Nothing logged, missed, or scheduled/)).toBeInTheDocument();
  });

  it("reports a failure rather than looking empty", async () => {
    apiFetchMock.mockRejectedValue(new Error("nope"));
    render(<TimelinePanel />);

    // An empty timeline and a broken request must not look the same - "nothing here" is a
    // reassuring thing to read, and it would be a lie in this case.
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't load your timeline/);
    expect(screen.queryByText(/Nothing logged, missed, or scheduled/)).not.toBeInTheDocument();
  });

  // One hourly reminder used to fill this panel's forward-only ancestor with 24+ near-identical
  // rows (docs/log/45) - the cap applies just as much to the merged past+future total, regardless
  // of which order they're read in.
  it("draws a dozen rows and says how many more there are", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      date: "2026-08-30",
      time: `${String(i).padStart(2, "0")}:00`,
      reminderId: `r${i}`,
      target: "category",
      categoryId: "cat-water",
      category: { name: "Water", icon: "💧" },
      state: "scheduled" as const,
    }));
    mockTimelineFetch({ upcoming: { ...emptyUpcoming, runs: many } });
    render(<TimelinePanel />);

    expect(await screen.findByText(/…and 18 more/)).toBeInTheDocument();
    expect(screen.getAllByText("💧 Water")).toHaveLength(12);
    // The header still reports the real total, not the drawn subset.
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});

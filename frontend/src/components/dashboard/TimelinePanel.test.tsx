import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelinePanel } from "./TimelinePanel";
import { apiFetch } from "../../api/client";

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

const emptyRecent = { timezone: "Europe/London", today: "2026-08-30", truncated: false, runs: [] };
const emptyUpcoming = {
  timezone: "Europe/London",
  today: "2026-08-30",
  truncated: false,
  runs: [],
};

// The panel fires two independent calls - one per endpoint - so a single `.mockResolvedValue`
// (fine for the old, single-endpoint UpcomingRemindersPanel) can no longer stand in for both.
// Branching on the URL is the same pattern this app's own page-level tests already use for a
// mount that fires several requests at once.
function mockTimelineFetch(overrides: { recent?: unknown; upcoming?: unknown } = {}) {
  apiFetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/reminders/recent")) {
      return Promise.resolve(overrides.recent ?? emptyRecent);
    }
    if (url.includes("/api/reminders/upcoming")) {
      return Promise.resolve(overrides.upcoming ?? emptyUpcoming);
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
      category: { name: "Anxiety", icon: "🧠" },
      state: "logged" as const,
    },
    {
      date: "2026-08-30",
      time: "09:00",
      reminderId: "r-missed",
      target: "category",
      category: { name: "Diazepam", icon: "💊" },
      state: "missed" as const,
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
      category: { name: "Sertraline", icon: "💊" },
      state: "logged" as const,
    },
    {
      date: "2026-08-31",
      time: "03:46",
      reminderId: "r-held",
      target: "category",
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
});

describe("TimelinePanel", () => {
  it("asks both endpoints for the same range by default", async () => {
    render(<TimelinePanel />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=1");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=1");
    });
  });

  // The point of the merge: a past row and a future row on the same calendar day land in one
  // "Today" group, not two - which only holds together if the NOW divider actually sits between
  // them.
  it("merges past and future rows into a single Today group, with NOW between them", async () => {
    mockTimelineFetch({ recent: recentWithRuns, upcoming: upcomingWithRuns });
    render(<TimelinePanel />);

    expect(await screen.findByText("🧠 Anxiety")).toBeInTheDocument();
    // Scoped to the day-group heading specifically, not the range chip that also happens to be
    // labelled "Today" - two day-groups both saying "Today" would mean the merge failed to
    // collapse past and future rows into one section.
    expect(screen.getAllByText("Today", { selector: "p" })).toHaveLength(1);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("NOW")).toBeInTheDocument();

    // Past, then NOW, then future - the actual reading order, not merely "all present somewhere".
    const anxietyRow = screen.getByText("🧠 Anxiety").closest("li") as HTMLElement;
    const now = screen.getByText("NOW");
    const sertralineRow = screen.getByText("💊 Sertraline").closest("li") as HTMLElement;

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

  it("re-asks both endpoints with the new range when it changes", async () => {
    render(<TimelinePanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "7 days" }));

    // Re-fetched rather than filtered client-side: the client has no way to know what happened
    // or will happen beyond the window it asked for.
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/recent?days=7");
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=7");
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
  // rows (docs/log/45) - the cap applies just as much to the merged past+future total.
  it("draws a dozen rows and says how many more there are", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      date: "2026-08-30",
      time: `${String(i).padStart(2, "0")}:00`,
      reminderId: `r${i}`,
      target: "category",
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

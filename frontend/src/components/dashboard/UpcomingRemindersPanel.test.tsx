import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpcomingRemindersPanel } from "./UpcomingRemindersPanel";
import { apiFetch } from "../../api/client";

vi.mock("../../api/client", () => ({ apiFetch: vi.fn() }));
const apiFetchMock = vi.mocked(apiFetch);

// Same non-functional-localStorage workaround the other panel tests document - the collapsed state
// persists through it.
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

const response = {
  timezone: "Europe/London",
  today: "2026-08-30",
  truncated: false,
  runs: [
    {
      date: "2026-08-30",
      time: "09:00",
      reminderId: "r1",
      target: "category",
      category: { name: "Sertraline", icon: "💊" },
      state: "logged" as const,
    },
    {
      date: "2026-08-31",
      time: "03:46",
      reminderId: "r2",
      target: "category",
      category: { name: "Diazepam", icon: "💊" },
      state: "held" as const,
      deliveredAt: "08:00",
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  stubWorkingLocalStorage();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue(response);
});

describe("UpcomingRemindersPanel", () => {
  it("asks for the next 24 hours by default", async () => {
    render(<UpcomingRemindersPanel />);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=1"),
    );
  });

  it("groups runs by day and shows the time and category", async () => {
    render(<UpcomingRemindersPanel />);

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("💊 Sertraline")).toBeInTheDocument();
    expect(screen.getByText("03:46")).toBeInTheDocument();
  });

  // The states are the reason this list is an explanation rather than a timetable. "Held" in
  // particular has to say when it will actually arrive - otherwise it reads as "you won't get it".
  it("says why a run will not simply fire when due", async () => {
    render(<UpcomingRemindersPanel />);

    expect(await screen.findByText("Held")).toBeInTheDocument();
    expect(screen.getByText("Quiet hours — arrives at 08:00")).toBeInTheDocument();
    expect(screen.getByText("Logged")).toBeInTheDocument();
  });

  it("re-asks the server when the range changes", async () => {
    render(<UpcomingRemindersPanel />);
    await screen.findByText("Today");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "7 days" }));

    // Re-fetched rather than filtered on the client: the client has no way to know what happens
    // beyond the window it asked for.
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/api/reminders/upcoming?days=7"),
    );
  });

  it("says plainly when nothing is due", async () => {
    apiFetchMock.mockResolvedValue({ ...response, runs: [] });
    render(<UpcomingRemindersPanel />);

    expect(await screen.findByText(/Nothing scheduled/)).toBeInTheDocument();
  });

  it("reports a failure rather than looking empty", async () => {
    apiFetchMock.mockRejectedValue(new Error("nope"));
    render(<UpcomingRemindersPanel />);

    // An empty list and a broken request must not look the same - "nothing coming up" is a
    // reassuring thing to read, and it would be a lie here.
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't work out/);
    expect(screen.queryByText(/Nothing scheduled/)).not.toBeInTheDocument();
  });

  // The panel answers "what is next" at a glance. One hourly reminder produces 37 runs in a day,
  // which is a scroll rather than an answer - so it draws a dozen and says how many are left.
  it("draws a dozen runs and says how many more there are", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      date: "2026-08-30",
      time: `${String(i).padStart(2, "0")}:00`,
      reminderId: `r${i}`,
      target: "category",
      category: { name: "Water", icon: "💧" },
      state: "scheduled" as const,
    }));
    apiFetchMock.mockResolvedValue({ ...response, runs: many });
    render(<UpcomingRemindersPanel />);

    expect(await screen.findByText(/…and 18 more/)).toBeInTheDocument();
    expect(screen.getAllByText("💧 Water")).toHaveLength(12);
    // The header still reports the real total, not the drawn subset.
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});

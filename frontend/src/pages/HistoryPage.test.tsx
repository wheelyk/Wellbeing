import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { HistoryPage } from "./HistoryPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/history"]}>
        <HistoryPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fetched entries grouped by date, most recent first", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "mood-1",
              type: "mood",
              label: "Mood 4/5",
              notes: null,
              loggedAt: "2026-08-17T14:00:00.000Z",
            },
            {
              id: "symptom-1",
              type: "symptom",
              label: "Headache — Severity 6/10",
              notes: "Started after lunch",
              loggedAt: "2026-08-17T09:00:00.000Z",
            },
            {
              id: "habit-1",
              type: "habit",
              label: "Exercise: Done",
              notes: null,
              loggedAt: "2026-08-16T14:00:00.000Z",
            },
          ],
          limit: 20,
          offset: 0,
          hasMore: false,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText("Mood 4/5")).toBeInTheDocument();
    expect(screen.getByText(/headache — severity 6\/10/i)).toBeInTheDocument();
    expect(screen.getByText("Started after lunch")).toBeInTheDocument();
    expect(screen.getByText(/exercise: done/i)).toBeInTheDocument();
    // Two distinct calendar days -> two date-group headings, each starting with a weekday name
    // (e.g. "Monday, August 17, 2026") - narrower than all level-2 headings on the page, which
    // also includes the (unrelated) collapsible Filters section's own heading.
    expect(screen.getAllByRole("heading", { level: 2, name: /^[A-Za-z]+day,/ })).toHaveLength(2);
  });

  it("shows an empty state when there are no entries yet", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false })),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(500, { error: { message: "Oops" } })));
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText(/couldn't load your history/i)).toBeInTheDocument();
  });

  it("refetches with a type query param when the type filter changes", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/nothing to show yet/i);

    await user.selectOptions(screen.getByLabelText(/type/i), "mood");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toContain("type=mood");
      expect(lastCall?.[0]).toContain("offset=0");
    });
  });

  it("deletes an entry optimistically via the correct per-type endpoint, rolling back on failure", async () => {
    const entry = {
      id: "sym-1",
      type: "symptom",
      label: "Headache — Severity 6/10",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    let deleteCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleteCallCount += 1;
        // First delete attempt fails (to exercise rollback); second (different test) succeeds.
        return Promise.resolve(jsonResponse(500, { error: { message: "Server error" } }));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/headache — severity 6\/10/i);

    await user.click(screen.getByRole("button", { name: /delete symptom entry/i }));

    // Optimistically removed, then rolled back once the DELETE call fails.
    await screen.findByText(/headache — severity 6\/10/i);
    expect(deleteCallCount).toBe(1);
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(deleteCall?.[0]).toContain(`/api/symptom-logs/${entry.id}`);
  });

  it("deletes an entry and keeps it removed when the DELETE call succeeds", async () => {
    const entry = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse(200, { message: "Deleted" }));
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

    await waitFor(() => {
      expect(screen.queryByText("Mood 4/5")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("does not delete when the confirmation is declined", async () => {
    const entry = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));

    expect(screen.getByText("Mood 4/5")).toBeInTheDocument();
    // AuthProvider's own mount-time rehydration attempt calls fetch once on its own,
    // regardless of this page - only "was a delete request made" matters here.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/mood-1"))).toBe(false);
  });

  it("loads more entries and appends them when Load more is clicked", async () => {
    const first = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const second = {
      id: "mood-2",
      type: "mood",
      label: "Mood 2/5",
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("offset=1")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [second], limit: 20, offset: 1, hasMore: false }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { entries: [first], limit: 20, offset: 0, hasMore: true }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Mood 2/5")).toBeInTheDocument();
    expect(screen.getByText("Mood 4/5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows Load less once more than a page is loaded, and it collapses back without a new fetch", async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => ({
      id: `mood-${i}`,
      type: "mood",
      label: "Mood 3/5",
      notes: null,
      loggedAt: `2026-08-17T${String(9 + (i % 12)).padStart(2, "0")}:00:00.000Z`,
    }));
    const twentyFirst = {
      id: "mood-20",
      type: "mood",
      label: "Mood 5/5",
      notes: null,
      loggedAt: "2026-08-16T09:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("offset=20")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [twentyFirst], limit: 20, offset: 20, hasMore: false }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { entries: firstPage, limit: 20, offset: 0, hasMore: true }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByText("Mood 3/5");
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Mood 5/5");
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load less/i })).toBeInTheDocument();

    const callsBeforeLoadLess = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /load less/i }));

    expect(fetchMock.mock.calls.length).toBe(callsBeforeLoadLess);
    expect(screen.queryByText("Mood 5/5")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mood 3/5")).toHaveLength(20);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load less/i })).not.toBeInTheDocument();
  });

  it("collapses one date group without affecting another", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          entries: [
            {
              id: "mood-1",
              type: "mood",
              label: "Mood 4/5",
              notes: null,
              loggedAt: "2026-08-17T14:00:00.000Z",
            },
            {
              id: "habit-1",
              type: "habit",
              label: "Exercise: Done",
              notes: null,
              loggedAt: "2026-08-16T14:00:00.000Z",
            },
          ],
          limit: 20,
          offset: 0,
          hasMore: false,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");
    expect(screen.getByText(/exercise: done/i)).toBeInTheDocument();

    // dateHeading always starts with a weekday name followed by a comma (e.g. "Monday, August
    // 17, 2026") - narrower than matching on a year, which the per-entry Delete buttons' own
    // accessible names (built from the full loggedAt timestamp) also happen to contain.
    const groupHeadings = screen.getAllByRole("button", { name: /^[A-Za-z]+day,/ });
    expect(groupHeadings).toHaveLength(2);
    await user.click(groupHeadings[0]);

    expect(screen.queryByText("Mood 4/5")).not.toBeInTheDocument();
    // The other day's group is untouched.
    expect(screen.getByText(/exercise: done/i)).toBeInTheDocument();
  });

  it("collapses the Filters section, hiding the fields but not the entry list", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/nothing to show yet/i);
    expect(screen.getByLabelText(/^type$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^filters$/i }));

    expect(screen.queryByLabelText(/^type$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^from$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^to$/i)).not.toBeInTheDocument();
    // Collapsing the filter fields doesn't touch the rest of the page.
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("disables the Edit button as a coming-soon affordance rather than wiring up editing", async () => {
    const entry = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await screen.findByText("Mood 4/5");

    expect(screen.getByRole("button", { name: /edit mood entry/i })).toBeDisabled();
  });
});

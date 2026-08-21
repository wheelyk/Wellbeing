import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/headache — severity 6\/10/i);

    // Delete now opens this app's own Modal-based confirmation dialog rather than a native
    // window.confirm() popup - clicking the row's Delete button only opens it; the actual
    // delete request only fires once the dialog's own "Delete" button is clicked.
    await user.click(screen.getByRole("button", { name: /delete symptom entry/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

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
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Mood 4/5")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("does not delete when the confirmation dialog is cancelled", async () => {
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
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");

    await user.click(screen.getByRole("button", { name: /delete mood entry/i }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Mood 4/5")).toBeInTheDocument();
    // The dialog itself closed, and no DELETE request against this entry was ever made -
    // AuthProvider's own mount-time rehydration attempt calls fetch once on its own, regardless
    // of this page, so only "was a delete request made" matters here.
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes("/mood-1") && init?.method === "DELETE",
      ),
    ).toBe(false);
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
        Promise.resolve(jsonResponse(200, { entries: [], limit: 20, offset: 0, hasMore: false })),
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

  it("opens the edit dialog pre-filled with the entry's real values", async () => {
    // The unified /api/history endpoint only returns a display label, not the underlying
    // structured fields (mood/energy/stress) - HistoryEditModal fetches those separately from
    // the per-type list endpoint (see historyLogApi.ts's findLogById), so the mock has to serve
    // that request too, not just the initial /api/history load.
    const entry = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5 · Energy 6/7 · Stress 2/7",
      notes: "Feeling okay",
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fullMoodLog = {
      id: "mood-1",
      userId: "user-1",
      mood: 4,
      energy: 6,
      stress: 2,
      notes: "Feeling okay",
      loggedAt: entry.loggedAt,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/history")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/mood-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [fullMoodLog], limit: 100, offset: 0, hasMore: false }),
        );
      }
      return Promise.resolve(jsonResponse(401, { error: { message: "No session" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/mood 4\/5/i);

    await user.click(screen.getByRole("button", { name: /edit mood entry/i }));

    await screen.findByRole("heading", { name: "Edit mood entry" });
    expect(screen.getByRole("radio", { name: "Good" })).toHaveAttribute("aria-checked", "true");
    const energyGroup = screen.getByRole("radiogroup", { name: "Energy (optional)" });
    expect(within(energyGroup).getByRole("radio", { name: "6" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const stressGroup = screen.getByRole("radiogroup", { name: "Stress (optional)" });
    expect(within(stressGroup).getByRole("radio", { name: "2" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Feeling okay");
  });

  it("PATCHes the correct endpoint with the right body and updates the visible list on save", async () => {
    const entry = {
      id: "mood-1",
      type: "mood",
      label: "Mood 4/5",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fullMoodLog = {
      id: "mood-1",
      userId: "user-1",
      mood: 4,
      energy: null,
      stress: null,
      notes: null,
      loggedAt: entry.loggedAt,
    };
    const updatedMoodLog = { ...fullMoodLog, mood: 5 };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/api/mood-logs/mood-1")) {
        return Promise.resolve(jsonResponse(200, updatedMoodLog));
      }
      if (url.includes("/api/history")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/mood-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [fullMoodLog], limit: 100, offset: 0, hasMore: false }),
        );
      }
      return Promise.resolve(jsonResponse(401, { error: { message: "No session" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Mood 4/5");

    await user.click(screen.getByRole("button", { name: /edit mood entry/i }));
    await screen.findByRole("heading", { name: "Edit mood entry" });

    await user.click(screen.getByRole("radio", { name: "Great" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          String(callUrl).includes("/api/mood-logs/mood-1") && callInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body));
      expect(body.mood).toBe(5);
      expect(body.energy).toBeNull();
      expect(body.stress).toBeNull();
      expect(body.notes).toBeNull();
    });

    // The list reflects the change immediately (recomputed from the PATCH response), and the
    // dialog closed - no separate /api/history refetch was needed.
    expect(await screen.findByText("Mood 5/5")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Edit mood entry" })).not.toBeInTheDocument();
  });

  it("resolves a symptom entry's name via /api/symptoms and PATCHes the symptom endpoint on save", async () => {
    const entry = {
      id: "sym-1",
      type: "symptom",
      label: "Headache — Severity 6/10",
      notes: null,
      loggedAt: "2026-08-17T09:00:00.000Z",
    };
    const fullSymptomLog = {
      id: "sym-1",
      userId: "user-1",
      symptomId: "symptom-headache",
      severity: 6,
      notes: null,
      loggedAt: entry.loggedAt,
    };
    const updatedSymptomLog = { ...fullSymptomLog, severity: 8 };
    const symptoms = [{ id: "symptom-headache", userId: null, name: "Headache" }];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/api/symptom-logs/sym-1")) {
        return Promise.resolve(jsonResponse(200, updatedSymptomLog));
      }
      if (url.includes("/api/history")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [entry], limit: 20, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/symptom-logs")) {
        return Promise.resolve(
          jsonResponse(200, { entries: [fullSymptomLog], limit: 100, offset: 0, hasMore: false }),
        );
      }
      if (url.includes("/api/symptoms")) {
        return Promise.resolve(jsonResponse(200, symptoms));
      }
      return Promise.resolve(jsonResponse(401, { error: { message: "No session" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText(/headache — severity 6\/10/i);

    await user.click(screen.getByRole("button", { name: /edit symptom entry/i }));
    await screen.findByRole("heading", { name: "Edit symptom entry" });

    // Pre-filled with the real symptom name, resolved from /api/symptoms via the log's
    // symptomId, not just carried over from the generic history label.
    expect(screen.getByRole("combobox", { name: /symptom/i })).toHaveValue("symptom-headache");
    await user.click(screen.getByRole("radio", { name: "8" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          String(callUrl).includes("/api/symptom-logs/sym-1") && callInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body));
      expect(body.severity).toBe(8);
      expect(body.symptomId).toBe("symptom-headache");
    });

    expect(await screen.findByText(/headache — severity 8\/10/i)).toBeInTheDocument();
  });
});

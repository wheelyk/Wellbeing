import { useState } from "react";
import { apiFetch } from "../api/client";

// Offered straight after logging something: "you've just taken it - want a nudge in four hours?"
//
// This is a different question from the reminder form, and deliberately a different control. A
// schedule is a pattern on the clock ("every day at nine"); this is an interval from the thing you
// just did, which cron cannot express at all, because cron has no idea when you logged. The server
// turns it into an ordinary one-shot reminder for later today (see routes/reminders.ts's
// POST /follow-up), so nothing new is being scheduled - only a new way of asking.
//
// It renders as a strip inside the card, in the same slot the "Entry saved." confirmation already
// used, rather than as a step in the save flow. That distinction was learned the hard way: making
// it a step meant every single log cost an extra tap to dismiss an offer almost nobody wants,
// which is a poor trade on the most-used action in the app. Here it costs nothing to ignore.
//
// Deliberately not a Toast either - a toast in this app is presentation-only and
// pointer-events-none (see Toast.tsx), and this has to be tappable.

// Offered in the order someone actually thinks in. Every one is at least the 15 minutes the API's
// own floor requires, and comfortably above the scheduler's five-minute tick.
const INTERVALS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
];

// Every interval is offered, at any hour. A follow-up used to be refused if it crossed midnight -
// the scheduler fires late by design, so a slot for "02:00" created at 22:00 read as already gone
// by and arrived at once - but Reminder.startsAt now makes "not before this moment" expressible, so
// one can legitimately land tomorrow morning. See docs/log/40-reminder-starts-at.md.
export function offeredIntervals(): typeof INTERVALS {
  return INTERVALS;
}

interface FollowUpPromptProps {
  categoryId: string;
  categoryName: string;
  onDismiss: () => void;
}

export function FollowUpPrompt({ categoryId, categoryName, onDismiss }: FollowUpPromptProps) {
  const [saving, setSaving] = useState<number | null>(null);
  const [firesAt, setFiresAt] = useState<{ time: string; tomorrow: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervals = offeredIntervals();

  async function choose(minutes: number) {
    setSaving(minutes);
    setError(null);
    try {
      const result = await apiFetch<{ firesAtLocal: string; firesTomorrow: boolean }>(
        "/api/reminders/follow-up",
        {
          method: "POST",
          body: JSON.stringify({ target: "category", categoryId, inMinutes: minutes }),
        },
      );
      setFiresAt({ time: result.firesAtLocal, tomorrow: result.firesTomorrow });
    } catch {
      // Says plainly that the entry itself is safe. The two actions are independent, and someone
      // who reads only "couldn't set that" would reasonably fear they had lost the log as well.
      setError("Couldn't set that reminder. Your entry was still saved.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        {firesAt ? (
          <p role="status" className="text-sm text-text">
            {/* "at 03:46" alone would read as this morning, which is already past - the day has to
                be said out loud once a follow-up can land on the other side of midnight. */}
            We&apos;ll remind you about {categoryName} {firesAt.tomorrow ? "tomorrow at" : "at"}{" "}
            <span className="font-medium tabular-nums">{firesAt.time}</span>.
          </p>
        ) : (
          <p className="text-sm text-text-muted">Remind you again in…</p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder suggestion"
          className="shrink-0 text-sm text-text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ✕
        </button>
      </div>

      {!firesAt && (
        <div
          role="group"
          aria-label={`Remind me about ${categoryName} again in`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {/* Deliberately chips rather than the secondary Button: that variant's background is the
              same token as this strip's, so on a real screen the buttons vanished into it
              entirely - they read as plain text with nothing to tap. These borrow the reminder
              form's own time-chip styling, which also reads better here: these are options to
              pick from, not actions to perform. */}
          {intervals.map((interval) => (
            <button
              key={interval.minutes}
              type="button"
              disabled={saving !== null}
              onClick={() => choose(interval.minutes)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === interval.minutes ? "Setting…" : interval.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

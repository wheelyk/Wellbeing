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

// A follow-up only runs for the rest of today - the API refuses one that would cross midnight
// rather than quietly delivering it immediately (a "02:00" slot created at 22:00 reads to the
// scheduler as a time that has already passed today, so it would fire at once). The ones that
// can't fit are therefore never offered: an option that always errors is worse than no option.
//
// The browser's own clock decides what to *offer*, which is fine - it can only be wrong by the gap
// between the device's timezone and the account's, and the server still has the final say on what
// actually gets created.
export function intervalsThatFitToday(now = new Date()): typeof INTERVALS {
  const minutesLeft = 24 * 60 - (now.getHours() * 60 + now.getMinutes());
  return INTERVALS.filter((interval) => interval.minutes < minutesLeft);
}

interface FollowUpPromptProps {
  categoryId: string;
  categoryName: string;
  onDismiss: () => void;
}

export function FollowUpPrompt({ categoryId, categoryName, onDismiss }: FollowUpPromptProps) {
  const [saving, setSaving] = useState<number | null>(null);
  const [firesAt, setFiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervals = intervalsThatFitToday();

  async function choose(minutes: number) {
    setSaving(minutes);
    setError(null);
    try {
      const result = await apiFetch<{ firesAtLocal: string }>("/api/reminders/follow-up", {
        method: "POST",
        body: JSON.stringify({ target: "category", categoryId, inMinutes: minutes }),
      });
      setFiresAt(result.firesAtLocal);
    } catch {
      // Says plainly that the entry itself is safe. The two actions are independent, and someone
      // who reads only "couldn't set that" would reasonably fear they had lost the log as well.
      setError("Couldn't set that reminder. Your entry was still saved.");
    } finally {
      setSaving(null);
    }
  }

  // Nothing left of today to fit even the shortest follow-up into, so there is nothing to offer -
  // and no reason to take up a row saying so.
  if (intervals.length === 0 && !firesAt) return null;

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        {firesAt ? (
          <p role="status" className="text-sm text-text">
            We&apos;ll remind you about {categoryName} at{" "}
            <span className="font-medium tabular-nums">{firesAt}</span>.
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

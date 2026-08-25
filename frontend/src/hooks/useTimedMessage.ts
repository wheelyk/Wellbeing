import { useEffect, useRef, useState } from "react";

// How long a transient confirmation (e.g. "Mood entry saved.") stays visible before clearing
// itself. Long enough to read comfortably, short enough that it doesn't linger as clutter once
// the user has moved on - this app has no toast/notification system, so a self-clearing inline
// message is the whole mechanism (see the Dashboard sections' handle*Saved functions).
const DEFAULT_DURATION_MS = 4000;

interface TimedMessageControls {
  message: string | null;
  // Shows `text`, replacing whatever's currently shown, and (re)starts the auto-clear timer -
  // calling this again before the previous message has cleared just resets the clock, rather
  // than stacking multiple timers that could clear the message early.
  showMessage: (text: string) => void;
}

// A small piece of state that shows a message and clears itself after `durationMs` - factored
// out of the Dashboard sections (Mood/Medication/Category) since each needs the exact same "say
// 'Saved.' then quietly go away" behavior for their post-save confirmation.
export function useTimedMessage(durationMs = DEFAULT_DURATION_MS): TimedMessageControls {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function showMessage(text: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(text);
    timeoutRef.current = setTimeout(() => setMessage(null), durationMs);
  }

  return { message, showMessage };
}

import { useEffect, useState } from "react";

/**
 * The current time, re-read on an interval so a countdown on screen keeps counting down.
 *
 * Pass null to stop ticking entirely — which is what almost every card does, since only a category
 * with a cooldown has anything to count. An always-on timer per card would mean a dozen intervals
 * running on a dashboard where none of them changes anything.
 *
 * The value is only ever *read* by pure functions (see lib/cooldown.ts), so this hook is the single
 * place the clock enters the component tree.
 */
export function useNow(intervalMs: number | null): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (intervalMs === null) return;
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

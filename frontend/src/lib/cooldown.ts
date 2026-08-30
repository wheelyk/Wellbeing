// "Not yet" — how long until this category can be logged again.
//
// A cooldown (see docs/log/39-category-timing.md) is the opposite instruction to a reminder: one
// prompts you to act, the other tells you not to yet. It needs no server state of its own at all,
// which is the nice part — it is entirely "last log + the gap", and both of those already arrive
// with the category.
//
// Pure, and takes `now` as an argument, so it can be tested at specific instants without touching
// a clock — the same shape reminderEligibility.ts uses on the backend for the same reason.

export interface Cooldown {
  remainingMs: number;
  /** "3h 12m", "12m", "under a minute" - the duration alone, so callers phrase the sentence. */
  remaining: string;
}

function formatRemaining(ms: number): string {
  // Under a minute is said in words rather than as "1m". Rounding up is what keeps a running
  // cooldown from ever showing "0m" - the one reading that actively misleads, since 0 reads as
  // "go ahead" - but it also means Math.ceil can never return 0, so the short case has to be
  // caught on the milliseconds instead. (An earlier version tested totalMinutes < 1, which was
  // unreachable; the test for it is what found that.)
  if (ms < 60_000) return "under a minute";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Null whenever there is nothing to count down: no gap set, never logged, or the gap has already
 * passed. Null is deliberately the "you're fine" answer as well as the "not applicable" one —
 * neither wants a countdown on screen, and a card should not carry a row saying "0m remaining".
 */
export function cooldownRemaining(
  lastLoggedAt: string | null | undefined,
  intervalMinutes: number | null | undefined,
  now: Date = new Date(),
): Cooldown | null {
  if (!lastLoggedAt || !intervalMinutes) return null;

  const last = new Date(lastLoggedAt).getTime();
  if (Number.isNaN(last)) return null;

  const remainingMs = last + intervalMinutes * 60_000 - now.getTime();
  if (remainingMs <= 0) return null;

  return { remainingMs, remaining: formatRemaining(remainingMs) };
}

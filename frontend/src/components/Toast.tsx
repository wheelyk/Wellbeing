// A transient confirmation that floats above the page rather than sitting in the layout.
//
// Until now this app's confirmations were inline `<p role="status">` elements (see
// useTimedMessage.ts's own comment, written when there was no toast mechanism at all). That works
// on a short screen, but on the Categories page it failed in a specific, reported way: the message
// rendered at the *top* of the list, so acting on a category near the bottom produced a
// confirmation that was scrolled off-screen entirely - indistinguishable from nothing happening.
//
// Deliberately presentation-only, with no provider or global queue: the timing and text still come
// from useTimedMessage, which the Dashboard already uses. That keeps this a change of *where* a
// confirmation appears rather than a new system to adopt everywhere at once. See
// docs/log/31-categories-page-polish.md.
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      // `status` + polite: a save confirmation should be announced, but never interrupt whatever a
      // screen-reader user is currently doing.
      role="status"
      aria-live="polite"
      // Clear of the bottom tab bar (h-16) on mobile, and of nothing in particular on desktop
      // where that bar is hidden. pointer-events-none so it can never intercept a tap meant for
      // the row underneath it.
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6"
    >
      <p className="rounded-full bg-text px-4 py-2 text-sm font-medium text-surface shadow-lg">
        {message}
      </p>
    </div>
  );
}

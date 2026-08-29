# Fix: the "+ Add time" Button Did Nothing

## 2026-08-29 — A reported bug, three possible causes, and why all three were fixed

**Task:** Reported directly from a real Android phone against the deployed app: _"the add time
button isn't working."_ A screenshot showed the reminder picker open on a category, with an empty
time input and the "+ Add time" button apparently doing nothing when tapped.

### Background / concepts

#### Why "nothing happens" is the worst kind of bug report to guess at

A button that throws an error tells you where to look. A button that does _nothing_ is
indistinguishable from a broken one, a disabled one, a mis-wired one, and one that ran perfectly
but had nothing to do. The report is accurate and the cause is ambiguous.

Reading the code turned up **three separate paths** to exactly that symptom — and rather than pick
the most likely and hope, all three were closed. Two of them were plainly wrong regardless of which
one the user hit.

### What was done

The three causes, in `ReminderScheduleForm.tsx`:

1. **The button was `disabled` until React state held a time.**

   ```tsx
   <Button ... onClick={addTime} disabled={!newTime}>+ Add time</Button>
   ```

   Correct-looking, and the root of the problem. Before choosing a time the button is inert, and
   this project's disabled styling is `opacity-60` — subtle in light mode and very subtle on the
   dark theme in the reporter's screenshot. It reads as an ordinary button that does nothing.

2. **Adding a time already on the schedule returned silently.**

   ```tsx
   if (!newTime || rule.times.includes(newTime)) return;
   ```

   A bare `return` with no feedback. Re-adding 09:00 looked exactly like a broken button.

3. **The controlled `<input type="time">` and React state can disagree on mobile.** A native time
   picker commits its value on dismissal, and the browser may blur the input as the next tap lands.
   Reading `newTime` from React state at the moment the handler ran was therefore not reliably the
   value the user could see in the field.

The fixes:

- **The button is never disabled.** A tap now always produces a visible response.
- **Both failure cases explain themselves** — "Choose a time first." / "20:30 is already on this
  schedule." — in a `role="alert"` so they're announced, cleared as soon as the input changes.
- **The input element's own value is the authority**, via a ref, with React state only as a
  fallback: `timeInputRef.current?.value || newTime`. The DOM node is also cleared explicitly after
  a successful add, since it holds its value independently of the state that was reset.

### Why it's needed

Adding a second time to a reminder was the reported failure, and on the affected device it was
unrecoverable — there was no way to tell the button apart from a broken one.

### Decisions

- **Fix all three rather than bisect to the single culprit.** Reproducing an Android-specific
  input-timing issue reliably would have taken far longer than closing every path, and two of the
  three (a silently-disabled button, a silent duplicate rejection) were defects on their own merits
  regardless of which one the reporter actually hit.
- **Never disable this button.** The general principle worth carrying: prefer a button that
  explains why it can't act over one that silently can't be pressed. Disabled controls are
  reasonable when the reason is _visible next to them_; here the reason (an empty field) was easy
  to miss, especially in dark mode.
- **Read from the DOM node, not only from state.** Normally the wrong instinct in React, and worth
  being explicit about why it's right here: for `<input type="time">` on mobile the element is
  populated by a native picker outside React's synthetic event flow, so the element is the more
  trustworthy source at the moment of the click. State is kept in sync for rendering; the ref is
  consulted for the value.

### Verification

- `npx vitest run` (frontend): 244 tests across 33 files, green — including 6 new regression tests
  covering each reported symptom (adds correctly, never disabled, explains an empty input,
  explains a duplicate, clears the error on change, empties the input after adding).
- `npx tsc -b`, `npm run lint`, `npm run format:check`, `npm run build`: clean.
- **Real browser against real servers**, 412×915, zero console errors:
  - button enabled with an empty input: `true`
  - tapping with nothing chosen: _"Choose a time first."_
  - adding 20:30: chips became `["09:00", "20:30"]`, input cleared
  - adding 20:30 again: _"20:30 is already on this schedule."_
  - resulting cron: `0 9 * * *` and `30 20 * * *`; row read `09:00, 20:30 daily`
- **Not proven**: that cause 3 (the mobile input-timing theory) was the one the reporter actually
  hit. It can't be confirmed without the original device, and the fix does not depend on knowing —
  which is precisely why all three paths were closed rather than one.

---

# Inline Time Picker, and Fewer Repeat Chips

## 2026-08-29 — Adding a time in one tap instead of three

**Task:** Direct feedback on the reminder picker running on a real phone: put a clock-with-plus
control next to the time chips, have it open the platform's own time picker, and let that picker's
own Set button add the time — removing both the visible time field and the separate "+ Add time"
button. Plus: drop the **Custom** repeat chip, and a question about whether **Weekends** earns its
place.

### Background / concepts

#### Why the previous arrangement took three steps

Adding a time meant: tap the time field, choose a time in the platform picker, confirm it, then
find and tap "+ Add time". The platform picker already has a confirm button — so the last step was
a second confirmation of something the user had just confirmed, and it was the step that made the
control feel broken when it didn't respond (see
[29-fix-add-time-button.md](29-fix-add-time-button.md)).

#### `showPicker()`, and why the input is still in the DOM

`HTMLInputElement.showPicker()` opens a native picker programmatically. It's the only way to get
the platform control without showing the input itself, and it must be called from a user gesture —
which a button click is.

The input therefore stays rendered, but transparent and stretched behind the "+" chip: `showPicker`
anchors its popup to the element, so keeping it exactly under the chip is what makes the picker
appear in the right place. `pointer-events-none` ensures every tap reaches the button on top.

### What was done

- **The time field and the "+ Add time" button are gone.** In their place, a dashed "🕐 +" chip
  sits inline with the existing time chips, sized to match them.
- **Tapping it calls `showPicker()`**, falling back to `focus()` + `click()` where that isn't
  available.
- **The picker's own confirmation adds the time**, via the input's `change` handler. There is
  nothing further to press.
- **The hidden input is `aria-hidden` and out of the tab order.** It's a mechanism, not a control;
  the button carries the accessible name, so exposing both would announce the same action twice.
- **The "Custom" repeat chip is removed.**
- **"Weekends" is kept** — see Decisions.

### Why it's needed

Three steps became one, the empty-field dead-end disappears entirely (there is no field to leave
empty), and the picker is meaningfully shorter on a phone — which matters, because it renders
inline inside a category row in a long scrolling list.

### Decisions

- **"Custom" removed, because it genuinely did nothing.** The day toggles are always visible and
  are the real control. Tapping "Custom" only kept whatever days were already selected, and the
  chip row already shows nothing pressed when the selection matches no preset — which communicates
  "custom" without a button that appears to do something.
- **"Weekends" kept, against the suggestion to drop it.** Worth stating the reasoning rather than
  just complying: of the remaining chips it saves the _most_ taps (reaching Sat+Sun from the
  every-day default means seven toggles otherwise), and "weekdays at one time, weekends at another"
  is the headline case the multiple-schedules work
  ([27](27-multiple-schedules-per-reminder.md)) exists to serve — so removing it would make the
  flow that feature was built for harder. Easy to revisit; the chips are a one-line list.
- **The input is hidden from assistive technology rather than labelled.** Two controls with the
  same accessible name for one action is worse than one. This also surfaced during testing: both
  the label and the button matched the same query, which was the signal that the model was wrong.
- **A duplicate time still explains itself** rather than being silently ignored, carried over from
  the previous fix.

### Verification

- `npx vitest run` (frontend): 244 tests across 33 files, green. The six add-time regression tests
  were rewritten for the new interaction rather than deleted — the failure modes they guard against
  (silent no-op, duplicate ignored, stale input value) all still apply, they just arrive through a
  different control now.
- `npx tsc -b`, lint, `format:check`: clean.
- **Real browser against real servers**, 412×915, zero console errors:
  - repeat chips are now exactly `["Every day", "Weekdays", "Weekends", "Every hour"]`
  - no "+ Add time" button anywhere; the time input's computed opacity is `0`
  - the "+" chip is present and carries the accessible name
  - simulating a picker selection of 20:30 produced chips `["09:00", "20:30"]` and a row reading
    `09:00, 20:30 daily`
- **A verification bug worth recording**: the first attempt set `input.value` directly and reported
  the time was _not_ added — which looked like a real defect. It wasn't: assigning `.value` bypasses
  React's internal value tracker, so no `change` reaches the component. A real native picker sets
  the value through the browser's own path, which React does see. Re-running through the native
  setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`) showed it
  working. The lesson is narrow but sharp: **a test harness that simulates a browser mechanism
  incorrectly produces a false failure that looks exactly like a real one.**
- **Not proven**: `showPicker()` behaviour on the reporter's specific Android build. The fallback
  path exists for browsers without it, but which one their device takes is unverified from here.

---

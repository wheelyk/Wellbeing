# Responsive Row Actions: Icons on Phones, Words on Wider Screens

## 2026-08-29 — One accessible name, two visual treatments

**Task:** Feedback while looking at the History page on a phone: Edit and Delete should be icons on
mobile — "in fact that's a good shout, icons in mobile screen and text on bigger screens, is that a
good idea?"

Yes, with one condition, which is what most of this change is about.

### Background / concepts

#### Why this pattern is safe, and the one way it usually goes wrong

Swapping a text label for an icon on narrow screens is a well-worn responsive pattern. It goes
wrong when the _accessible_ name changes with the viewport — or worse, disappears entirely, leaving
a button whose only name is an emoji. A screen reader then announces "🗑️ button", and any test
addressing the button by name breaks at one width and not the other.

The rule that makes it safe: **the accessible name is constant at every width; only the visible
content swaps.** The icon is `aria-hidden`, and the name comes from a prop rather than from
whatever text happens to be rendered.

The strongest evidence this was done correctly is that **all 251 existing tests passed unchanged**
after the swap — because from an accessibility tree point of view, nothing moved.

#### Why the accessible name and the visible label are separate props

They genuinely differ. A History row's button should read **"Edit"** on screen but announce **"Edit
entry from 29/08/2026, 09:15"** — a page full of buttons all named "Edit" is useless to anyone
navigating by name. So `ActionButton` takes `label` (visible from `sm:` up) and an optional `name`
(the accessible name at every width), defaulting to `label` when that's already unambiguous.

This was caught by getting it wrong first: the initial version had one `label` prop, which would
have rendered the entire "Edit entry from 29/08/2026, 09:15" string as visible button text on
desktop.

### What was done

1. **`components/ActionButton.tsx`** (new) — wraps `Button`, renders `icon` below `sm:` and `label`
   from `sm:` up, with `aria-label={name ?? label}` at all widths and the icon `aria-hidden`.
2. **History** — Edit and Delete. They already carried per-entry `aria-label`s, so the swap was
   purely visual there.
3. **Categories** — the bell, Edit, Delete, and Hide/Unhide on every category row, plus Rename and
   Hide/Unhide on every group header.
4. **Hide/Unhide gained per-item names.** They were bare `"Hide"`, which was never a distinguishing
   name on a page rendering dozens. Now `"Hide Sleep hours"`, matching what Edit and Delete already
   did. Two tests were updated to match — the only tests this change touched, and they were
   asserting the weaker behaviour.

### Why it's needed

Three text buttons don't fit beside a long category name at 412px; the same three fit comfortably
at 900px, where words are clearer than icons. The row was previously built for the narrow case at
every width.

### Decisions

- **`sm:` (640px), not the `md:` used elsewhere in this app.** `md:` is where the navigation _mode_
  changes — bottom tab bar to top bar (see `BottomNav.tsx`). This is a much narrower question:
  whether a row has room for a word or two beside a name. That room appears well before 768px, so
  matching the nav breakpoint here would keep icons on screens that comfortably fit labels.
- **Group headers got the same treatment as the rows inside them.** Not in the original request,
  but a screenshot made the inconsistency obvious: icon actions on category rows sitting directly
  beneath text actions on the group header above them, at the same width. Consistency within one
  visual list is worth more than a strictly minimal diff.
- **Emoji icons rather than an icon set.** This app already uses emoji throughout (nav, groups,
  categories), and adding an icon library for six buttons would be a disproportionate dependency.
  The trade-off is real — emoji render differently across platforms — but it's the house style, and
  the label is always one breakpoint away.

### Verification

- `npx vitest run` (frontend): **256 tests across 36 files, green** — 5 new for `ActionButton`
  (label as name, explicit name wins, icon is `aria-hidden` and never part of the name, still
  behaves as a button, passes variants through).
- `npx tsc -b`, lint, `format:check`, `npm run build`: clean.
- **Real browser at both breakpoints**, zero console errors, checked on Categories and History:

  | Viewport | Visible text | Accessible name                        |
  | -------- | ------------ | -------------------------------------- |
  | 412px    | `🔔`         | `Remind me about Headache`             |
  | 900px    | `Remind`     | `Remind me about Headache`             |
  | 412px    | `✏️`         | `Edit entry from 29/08/2026, 11:00:00` |
  | 900px    | `Edit`       | `Edit entry from 29/08/2026, 11:00:00` |

- **A measurement bug worth recording**: the first check used Playwright's `textContent()` and
  reported the _same_ visible text at both widths — which looked like the responsive classes
  weren't working at all. They were: `textContent` returns every node regardless of CSS, so it saw
  both spans. `innerText()` respects rendering and showed the swap correctly. The general lesson is
  the same one from the previous entry: **a harness that measures the wrong thing produces a false
  result indistinguishable from a real defect.**
- **Not proven**: how these specific emoji render on the reporter's Android build. They're drawn by
  the platform font, so they will differ from the screenshots taken here.

---

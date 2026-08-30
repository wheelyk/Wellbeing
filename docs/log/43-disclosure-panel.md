# One Disclosure Header, and Why the Best One Had Escaped

## 2026-08-30 — A collapsed panel should still answer a question

**Task:** From four screenshots side by side: _"the last page has much better collapsible panels and
we should apply similar to the other screens."_ The Categories screen was right and the other three
were not, and the interesting part was working out why.

This is the component half. The content it now makes possible — counts on History dates, last values
on Dashboard cards, a cooldown countdown — follows in its own task, as does the "Coming up" panel.

### Background / concepts

#### What Categories was doing that the others weren't

`Recent Anxiety ⌄` tells a reader nothing they did not already know. `💊 Medicine · Built-in · 2`
tells them three things, and the rows beneath it add a fourth (`Yes / No · 07:30 daily`) — all
without opening anything.

That is the whole principle, and it is worth stating as a rule rather than a style: **a collapsed
panel should still answer a question.** If closing a section makes it useless, the header is not
doing its job.

#### Three implementations, and the good one was the one that got away

| Where                                       | Its header could hold                                   | Used by                   |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------- |
| `CollapsibleSection`                        | Title only — the whole header was one `<button>`        | History, Trends, Settings |
| `SectionPanel`                              | Title, chevron, one fixed "+"                           | Dashboard                 |
| `GroupSection` (inline in `CategoriesPage`) | Icon, title, pill, count, **and an independent action** | Categories                |

The third was much the best, and that was not luck. Its own comment says why it was hand-written:
`CollapsibleSection`'s entire header was a single toggle `<button>`, so a Hide control had nowhere
to live — a button inside a button is invalid HTML, and tapping it would have toggled the section
too.

Being forced out of the shared component is _exactly_ why it acquired a count and a pill. Once a
header is being written by hand, adding to it costs nothing. The other two stayed thin because
adding to them meant editing a component three other pages shared.

So this was not a matter of inventing a pattern. It was moving the one that already worked into the
component, and deleting the other two.

### What was done

- **`CollapsibleSection` gained the slots that made Categories good**: `icon`, `subtitle`, `badge`,
  `meta` (the count), and `actions`.
- **The header is now a flex row whose first child is the toggle**, so `actions` are siblings of it
  rather than children. That single structural change is what made the other two expressible.
- **`SectionPanel` is now that component plus a card and a "+"** — about sixty lines of duplicated
  header markup deleted.
- **`GroupSection`'s hand-written header is gone**, replaced by the component it was originally
  written to work around.
- **`StatusPill`** extracted — the same span had been written out three times, and the Dashboard is
  about to want one for a cooldown.
- **`size` and `heading`** so a nested group header can be quieter than a page-level section, and
  need not be an `<h2>`.

### Decisions

- **The name `CollapsibleSection` stayed.** The design proposal called it `DisclosurePanel`;
  renaming would have touched every import for no behaviour gain, in a change whose entire value is
  that it changes no behaviour. The name is still accurate.

- **`headerClassName` and `contentClassName` exist purely so one component can serve both shapes.**
  `SectionPanel` pads inside its card and rules off its content; the bare callers want neither.
  Without those two props, one of them would have had to keep its own copy of this component over
  nothing but padding — which is how there came to be three in the first place.

- **Group headers are deliberately not headings.** A page renders a dozen of them; making each an
  `<h2>` would bury the page's own heading structure. `heading={false}` keeps the accessibility tree
  exactly as it was.

- **No content changed.** No count was added to a History date, no subtitle to a Dashboard card.
  That is the next task. Keeping this one to "the same pixels, from one component" is what let the
  existing suite act as the safety net.

### Verification

- **Frontend: 276 tests across 37 files, green** (273 before, plus three new). `tsc -b`, oxlint,
  prettier and `npm run build` all clean.
- **The structural guarantee is mutation-tested.** Moving `actions` back inside the toggle button —
  the old broken shape — fails `keeps an action out of the toggle button, so it acts independently`,
  which asserts `toggle.contains(action) === false` rather than merely that both render.
- **Test count checked, not assumed.** The new `describe` additions took the file from 3 tests to 6.
  (See [39](39-category-timing.md) for the time a block landed inside `afterAll` and 14 tests
  silently never ran.)
- **Before-and-after screenshots at 412px**, same account, same data, driven through a real browser
  against real servers:

  | Screen     | Result                                 |
  | ---------- | -------------------------------------- |
  | Home       | **byte-identical**                     |
  | History    | **byte-identical**                     |
  | Trends     | 2 bytes different — PNG noise          |
  | Categories | visually identical after the fix below |

#### The regression the screenshots caught and the tests did not

The first version moved the **"Built-in" pill** from beside the group name out to the right, next to
the count. Every test still passed — no test asserts where a pill sits.

It was wrong for a specific reason: the category rows _inside_ a group put their own "Built-in" pill
immediately after the name, so a group header that put it somewhere else made one screen look like
two designs. The existing code even had a comment about keeping headers and their rows in agreement.

The badge now renders inside the title line, and Categories matches its old rendering. Worth
recording plainly: a refactor whose promise is "nothing changes" cannot be verified by a test suite
that never asserted the thing that changed.

#### A pre-existing flaky suite, measured rather than assumed

While verifying, the full frontend suite failed intermittently — `SettingsPage`'s reminder and
password tests, at 5060ms and 2096ms, which read as timeouts rather than assertions.

Rather than blame it on my change or shrug it off, I measured it on **clean `main`, with the branch
stashed**:

|                                  | Full-suite runs | Failures |
| -------------------------------- | --------------- | -------- |
| `main`, parallel (as shipped)    | 3               | **2**    |
| this branch, parallel            | 5               | **3**    |
| `main`, `fileParallelism: false` | 3               | **0**    |

So: pre-existing, not caused by this branch, and fixed by the same setting the _backend_ suite
already adopted for the same reason ([35](35-reliable-backend-test-suite.md)). The frontend simply
never got it. `fileParallelism: false` is included here, because a suite that fails half its runs
cannot serve as the safety net a no-behaviour-change refactor depends on.

**What this does not prove.** Only four screens were photographed, at one width, in one theme.
Nothing was checked at desktop width, where `SectionPanel` sits in a two-column grid. And
byte-identical PNGs prove the rendering matched on this machine at this scale — not that no
behavioural edge case moved.

### Known limitations and follow-ups

- **The content is the next task**: counts on History dates, last-value subtitles and a cooldown
  countdown on Dashboard cards, and the tighter rhythm on Trends.
- **A `DisclosureRow` for nested rows is still missing.** Categories has the pattern (title, second
  line, inline actions) written out by hand in `CategoryRow`; History and the Dashboard both want
  it. It was left alone here because extracting it is a bigger diff than this refactor's safety net
  can honestly cover in the same change.
- **`GroupSection` still owns its own card** (`rounded-xl border p-3`), as do the Trends sections.
  That is deliberate — the component renders a header and its content, not a card — but it does mean
  card styling is still per-caller.

---

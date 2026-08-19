# Responsive Design

## 2026-08-19 — Adopting mobile-first responsive design as a real convention, not just a phrase

**Task:** Not a [Tasks.md](../../Tasks.md) checklist item — a deliberate methodology adopted for
the whole frontend, prompted directly by a question about whether this app was already doing
"progressive" screen-size design, and a request to explain the concept for a beginner while
doing it.

### Background / concepts

#### Two different things that sound alike: "Progressive Web App" vs. "mobile-first responsive design"

Worth separating clearly, since they're easy to conflate and only one of them is what this entry
is actually about:

- **A Progressive Web App (PWA)** is a specific bundle of web technologies that let a website
  behave more like an installable app: a `manifest.json` file describing its name/icons/launch
  behavior, a *service worker* (a background script that can cache files for offline use, show
  push notifications, etc.), and an "Add to Home Screen" prompt. WellTrack doesn't have any of
  this yet, and building it would be a real, separate, much bigger task — nothing in this entry
  touches it.
- **Mobile-first responsive design** — what this entry is actually about — is a *layout*
  methodology, not a technology. It means: design and build the smallest/narrowest screen's
  layout first, as the default, and only add complexity (extra columns, more visible content)
  for larger screens as an *enhancement* on top of that working baseline. This is itself one
  application of a broader idea called **progressive enhancement**: start from something that
  already works everywhere, then layer on improvements for environments capable of using them —
  historically about browser feature support, but the same logic applies directly to screen size.

#### Why "mobile-first," specifically, and not "design for desktop, then shrink it"

Two real reasons, not just a naming convention:

1. **Screen width is usually the *harder* constraint to satisfy, not the easier one.** A layout
   with room to spare (a wide desktop window) can always just show a narrow layout with empty
   space on either side and look intentional — that's exactly what this app's `max-w-3xl`
   centered container has been doing on every page since Phase 5. The opposite direction is much
   less forgiving: a layout genuinely designed for a wide screen (multiple columns, generous
   spacing) usually breaks outright on a narrow one — text wraps badly, buttons overlap, content
   overflows sideways. Designing the constrained case first means the unconstrained case is easy;
   designing the unconstrained case first means the constrained case is where all the real,
   late-discovered problems show up (this is exactly what happened with `NavBar`'s own
   mobile-overflow bug, fixed in an earlier entry — a case where the "obvious" desktop-first
   layout genuinely broke once screen width became the binding constraint).
2. **It matches how Tailwind CSS (already used throughout this app since Phase 0) actually
   works.** Every Tailwind utility class with no breakpoint prefix (`grid-cols-1`, `flex-col`)
   applies at *every* screen width unless overridden. A prefixed class (`md:grid-cols-2`,
   `lg:flex-row`) only takes effect at that breakpoint's width *and above* — it's a `min-width`
   media query under the hood, not a `max-width` one. That means unprefixed classes are
   structurally the "mobile" (or rather, "every size, until told otherwise") styles, and prefixed
   classes only ever add complexity going *up* in screen size, never down. Writing
   `md:grid-cols-2` without first deciding what happens at the base (unprefixed) size isn't
   possible even by accident — the tool's own class-naming shape enforces designing the smallest
   case first.

#### What "progressively better" concretely means for this app

Not every page benefits from the same treatment, and treating "add breakpoints everywhere" as the
goal would miss the actual point. The real question per page is: *does more screen width give
this specific content something genuinely useful to do with it?*

- **Dashboard's four sections (Mood/Habit/Medication/Symptom)** — yes: they're independent,
  roughly similar-sized cards with no inherent reading order between them, so a 2-column grid at
  `md:` (768px) genuinely reduces scrolling without hurting comprehension.
- **Trends' two line charts** — yes, but not until `lg:` (1024px), one breakpoint later than
  Dashboard. A line chart needs real width to keep its trend visible; squeezing two into a
  768px-wide tablet screen (384px each, minus padding) would make the data *harder* to read, not
  just visually tighter — the opposite of what "progressively better" is supposed to mean. The
  Activity calendar next to them deliberately stays full-width at every size instead of joining
  that grid — a 7-column weekly calendar already uses horizontal space well on its own and would
  only get more cramped split in half.
- **History's filter bar** — a smaller case of the same idea: four fields (type/from/to/clear)
  stack in one column on mobile (each field full-width, easy to tap) and become one horizontal
  row from `sm:` (640px) up. This one previously relied on `flex-wrap`'s own default wrapping
  point, which happened to look reasonable, but wasn't an actual breakpoint decision anyone made —
  just wherever the fields' combined widths happened to overflow. Rewriting it as an explicit
  `flex-col … sm:flex-row` is the same visual result at the two extremes, but now the "when do
  these go horizontal" question has a real, intentional answer instead of an incidental one.
- **Login/Register/Forgot-Password/Reset-Password/Settings** — deliberately **untouched**. Every
  one of these is already a single, narrow, centered `<Card>` (`max-w-sm`, 384px). A login form
  doesn't get more useful by getting wider on a bigger screen — long input rows on a wide desktop
  screen are *harder* to scan, not easier. "Mobile-first" doesn't mean "add breakpoints
  everywhere"; it means only adding them where extra width actually helps, and these pages are
  the clear counter-examples.

### What was done

1. **`DashboardPage`**: the four section panels moved from a plain vertical stack (each with its
   own `mt-8` margin) into `<div className="grid grid-cols-1 gap-6 md:grid-cols-2">` — one column
   below 768px, two from `md:` up. `SectionPanel`'s own outer `<section>` lost its `mt-8` (spacing
   now comes entirely from the grid's `gap-6`, so the two sources of spacing can't silently double
   up depending on grid position). The page's own container widened from `max-w-3xl` to
   `md:max-w-5xl`, so the 2-column grid actually has room to use, rather than squeezing two
   columns into a width originally sized for one.
2. **`TrendsPage`**: the Symptom Severity and Mood charts moved into
   `grid-cols-1 lg:grid-cols-2` (note: `lg:`, not `md:` — see *Background* above for why); the
   Activity calendar stays outside that grid, full-width at every size. Container widened
   `max-w-3xl lg:max-w-5xl`, matching the later breakpoint the charts themselves switch at.
3. **`HistoryPage`**: the filter bar changed from `flex flex-wrap items-end gap-4` (incidental
   wrapping) to `flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end` (a deliberate
   breakpoint). Its own container width and entry-list layout were left as-is — a chronological,
   date-grouped list doesn't have the same "independent cards" shape Dashboard's sections do, so
   there's no equivalent 2-column opportunity here.
4. Auth pages and Settings confirmed already correct and left alone (see *Background*).

### Why it's needed

Before this, every page had exactly one layout regardless of screen size — correct in the sense
that nothing overflowed or broke, but it meant a desktop or tablet visitor was looking at a
narrow, mobile-shaped column with empty space on either side even though their screen had genuine
room to show more at once. That's not wrong, but it's not "progressively better" either — it's
just "the same," which is what prompted the question this entry answers.

### Decisions

- **Different pages switch to their wider layout at different breakpoints (`md:` for Dashboard,
  `sm:` for History's filters, `lg:` for Trends), not one breakpoint applied uniformly.** Each
  choice is driven by what the specific content needs room for, not a single app-wide rule — see
  the per-page reasoning under *Background*. A blanket "everything goes 2-column at `md:`" rule
  would have made Trends' charts harder to read, which is the opposite of the goal.
- **Only Dashboard and Trends widen their outer container past `max-w-3xl`.** History's content
  doesn't need the extra width even though its filter bar did get a real breakpoint; Settings and
  every auth page stay at `max-w-sm` via `Card`, unchanged, because widening a form is a
  regression, not an enhancement.
- **Grid `gap` for spacing between Dashboard's panels, not per-panel margin.** `SectionPanel` no
  longer sets its own top margin — letting the parent grid's `gap-6` be the single source of
  spacing avoids the two mechanisms (a child's own margin, a parent's own gap) silently combining
  in position-dependent ways once panels sit in a 2-column grid instead of one long column.

### Verification

- `npm test` (frontend): 132/132 passing — no test asserted on the old single-column-only
  structure in a way that broke; the wrapping `<div className="grid">` around the four sections
  and the `<div className="grid">` around Trends' two charts are pure layout, invisible to
  role/text-based queries.
- `npm run build`, `tsc -b`, `npm run lint`, `npx prettier --check` — all clean.
- Real, measured check against a live dev server at three widths — 375px (mobile), 800px
  (tablet), 1280px (desktop) — not just eyeballing screenshots: read each grid's actual computed
  `grid-template-columns` back out of the DOM via `getComputedStyle`, and separately measured
  each Dashboard panel's real bounding-box height to confirm CSS Grid's default row-stretch
  behavior was genuinely equalizing row heights (an initial screenshot *looked* like it wasn't —
  Mood's card looked taller than Habit's — but the measured heights were identical, 367px and
  367px; the screenshot's apparent mismatch was a misread, not a real layout bug). Results matched
  the design exactly: Dashboard 1→2 columns at `md:` (375px/800px/1280px → 1/2/2 columns), Trends
  1→2 columns at `lg:` (1/1/2 columns — correctly staying single-column at the 800px tablet width
  where Dashboard had already switched), History's filter bar `column`→`row` at `sm:`
  (375px/800px/1280px → column/row/row). No horizontal overflow (`document.documentElement`
  `scrollWidth` vs. viewport width) at any width on any of the three pages.

---

# Frontend Concepts — What This Project Uses, and What Else Is Out There

The [implementation log](../IMPLEMENTATION_LOG.md) explains _what was built_ and _why_, task by
task. This page steps sideways and explains the **concepts and tooling choices** behind that work —
the things you'd meet reading any modern frontend codebase, not just this one.

It's written for someone new to frontend development. Each section explains the idea, shows what
this project actually does, and — where there's a genuinely popular alternative — explains that
too, so you can recognise it when you meet it elsewhere and understand why this project went the
other way.

For short definitions of individual terms, see the [Glossary](GLOSSARY.md).

---

## 1. How the frontend talks to the backend: API routes vs. Server Actions

This is the biggest architectural fork in modern frontend work, and the one most likely to confuse
someone reading two different tutorials.

### What this project does: a REST API

WellTrack is a **single-page application (SPA)** talking to a **separate REST API**:

- The frontend is a React app, built by Vite into plain static files (HTML, JS, CSS). It runs
  entirely in the user's browser.
- The backend is a separate Express program that speaks HTTP and returns JSON. It has no idea
  React exists.
- They only ever communicate over HTTP. The frontend calls something like
  `GET /api/categories`; the backend answers with JSON.

Concretely, saving a category in this codebase means:

1. You write a backend **route** — a URL the server understands (`POST /api/categories` in
   `backend/src/routes/categories.ts`), including validating the incoming data.
2. You write frontend code that **calls** that URL — here, through the shared `apiFetch` helper in
   `frontend/src/api/client.ts`, which adds the auth token, sets headers, and parses the response.
3. You define the **shape** of the data on both sides — a TypeScript `interface` in the frontend, a
   Zod schema in the backend — and keep them in agreement yourself.

That third point is the notable cost: nothing automatically guarantees the frontend's idea of a
`Category` matches the backend's. They're two separate programs; agreement is a convention you
maintain, not something the compiler enforces across the boundary.

### The alternative: Server Actions

**Server Actions** (a React 19 feature, most commonly used through Next.js) collapse those three
steps into one. You write an async function, mark it as server-side, and call it directly from
your component:

```tsx
// Conceptually — this is Next.js-style, not how this project works
"use server";

export async function createCategory(name: string) {
  // This code only ever runs on the server
  return db.category.create({ data: { name } });
}
```

```tsx
// ...then called from a component as if it were a normal function
await createCategory("Water intake");
```

There's no URL, no `fetch`, no manual JSON handling. The framework generates the network request
behind the scenes. Because both sides are the same TypeScript project, the types are **shared
automatically** — if you change the function's arguments, the calling component fails to compile
immediately. That's the main appeal.

### The real trade-off

|                                             | REST API routes (this project)                            | Server Actions                                 |
| ------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Who writes the network layer                | You (routes, fetch client, error handling)                | The framework                                  |
| Type safety across the boundary             | Maintained by convention                                  | Automatic — one project, one type              |
| Other clients (mobile app, scripts, `curl`) | Works — it's just HTTP                                    | Not really — tied to this app's UI             |
| Can be tested independently                 | Yes — `curl` it, or Supertest it with no browser involved | Harder — it's coupled to the framework         |
| Requires a framework                        | No — any frontend, any backend                            | Yes — Next.js or similar with a server runtime |
| Hosting                                     | Frontend can be static files on a CDN                     | Needs a running server or serverless platform  |

**Why this project uses REST:** the requirements explicitly call for the frontend and backend to
remain _independently testable and deployable_ — two separate programs, each able to be worked on,
tested, and hosted without the other. That rules out Server Actions, which by design fuse the two
into a single application. A REST boundary also means the backend is usable by anything that speaks
HTTP later (a mobile app, a script, an integration) without rewriting it.

**When Server Actions are the better choice:** you're building one web app, with one frontend, in
one Next.js project, and you don't need the API to be consumable by anything else. In that case the
REST boundary is real work — two type definitions, a fetch layer, error handling on both sides —
buying you flexibility you may never use. A lot of products genuinely fall into this category.

**Worth knowing:** this isn't strictly a Next.js idea. React Router 7 (which this project already
uses, in its simpler "declarative" mode) also has a full framework mode with server-side
`loader`/`action` functions in the same spirit. The pattern is spreading; the trade-off above stays
the same wherever you meet it.

---

## 2. Tailwind CSS, explained in React terms

Tailwind tends to look wrong to people at first — it's a wall of tiny class names in your markup,
which is precisely what every previous generation of CSS advice told you to avoid. It makes much
more sense once you frame it as **a reaction to components**.

### The problem it's solving

Traditional CSS has its own reuse mechanism: you invent a semantic class name, define it once in a
stylesheet, and apply it everywhere.

```css
/* styles.css */
.card {
  padding: 1.5rem;
  border-radius: 1rem;
  border: 1px solid #ddd;
}
```

```html
<div class="card">…</div>
```

That works, but it has real costs that only show up at scale:

- **Indirection.** Reading the markup tells you nothing about what it looks like. You have to go
  find `.card` in another file.
- **CSS is global.** Every class name shares one namespace across the whole app, so names collide,
  and you get defensive naming conventions (BEM, `.dashboard__card--compact`) to work around it.
- **Nothing tells you when a style is dead.** Delete a component and its CSS stays behind forever,
  because no tool can be sure nothing else uses `.card`.

### The React insight

Here's the key: **React already gave you a reuse mechanism — the component.** If you want a
reusable card, you don't need a `.card` class. You make a `<Card>` component, and reuse _that_.

Keeping semantic CSS classes alongside components means running two competing reuse systems for the
same job. Tailwind's answer is to pick one: **reuse happens through components; styling is
utilities applied right where the markup is.**

```tsx
// The style lives with the markup — no separate stylesheet, no invented name
<div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
  …
</div>
```

Each class does exactly one thing (`p-6` = padding, `rounded-2xl` = corner radius). Nothing is
global, nothing is indirect, and deleting the component deletes its styling with it — because the
styling was never anywhere else.

**When you need to reuse it, you extract a component, not a class.** This project does exactly
that:

- `frontend/src/components/Button.tsx` — one component, with a `variant` prop for
  primary/secondary, instead of `.btn` and `.btn-secondary` classes.
- `frontend/src/components/Card.tsx` — the standard card container.
- `SectionCard` inside `SettingsPage.tsx` — a local wrapper for that page's wider layout.

If you find yourself repeating a long identical class string, that's the signal to make a
component — the same instinct as noticing repeated JSX.

### A real gotcha this project hit

Utility classes are not simply "last one wins." `SettingsPage.tsx` needed a wider card than
`Card.tsx`'s built-in `max-w-sm`, and putting both `max-w-sm` and `max-w-2xl` on one element does
**not** reliably give you the second one — which of two conflicting utilities wins depends on the
order Tailwind generated them in its stylesheet, not the order you wrote them in your `className`.
The fix was a separate `SectionCard` wrapper that only ever has one max-width utility on it. The
general lesson: don't rely on overriding one utility with another; restructure so the conflict
doesn't exist.

### Tailwind v4 specifics

This project uses Tailwind **v4**, which is configured differently from the v3 you'll see in most
tutorials:

- **No `tailwind.config.js` and no `postcss.config.js`.** v3 required both.
- Instead, it's enabled by a single line — `@import "tailwindcss";` in `frontend/src/index.css` —
  wired in through the `@tailwindcss/vite` plugin.
- Design tokens (`bg-surface`, `text-text-muted`, `border-border` — the colour names you'll see
  throughout this codebase) are defined in CSS, and are what makes the app's light/dark theming
  work from one place.

This is exactly the kind of major-version difference worth knowing about: following a v3 tutorial
here would have you creating config files this project deliberately doesn't have.

---

## 3. The rest of the toolkit

What this project uses, and what each thing is actually _for_.

### Build and language

- **Vite** — the dev server and build tool. In development it serves your code near-instantly and
  hot-reloads changes; for production it bundles everything into optimised static files. It
  replaced older tooling (webpack, Create React App), mainly on speed.
- **TypeScript** — JavaScript with types. Catches whole categories of mistakes before the code
  runs: a misspelled property, a function called with the wrong arguments, a value that might be
  `null` and wasn't checked.

### React and routing

- **React 19** — the UI library. You describe what the screen should look like for a given state,
  and React updates the DOM when that state changes.
- **React Router 7** — client-side routing. Navigating between `/dashboard` and `/settings` swaps
  which component renders without a full page reload.
- **Hooks** — reusable stateful logic, extracted from components. This project's own
  `useCollapsedState` (remembering whether a section is collapsed) and `useThemePreference`
  (light/dark/system) are good examples: each bundles up some state plus its persistence, and any
  component can use it.
- **Context** — a way to make a value available to a whole subtree without passing it down through
  every intermediate component. `AuthContext` here holds "who is logged in," which is needed all
  over the app.

### Testing and quality

- **Vitest** — the test runner. Same configuration and speed characteristics as Vite.
- **React Testing Library** — the philosophy matters here: you query the page the way a _user_
  would (by visible text, by label, by role — `getByRole("button", { name: "Save" })`) rather than
  by internal implementation detail. Tests written this way keep passing when you refactor, and
  fail when the user-visible behaviour actually breaks.
- **Playwright** — real end-to-end tests in a real browser against real running servers. Catches
  the class of bug that mocked tests structurally cannot — see
  [Lessons Learned](LESSONS-LEARNED.md) for several this project actually hit.
- **oxlint** and **Prettier** — a linter (catches likely mistakes and bad patterns) and a formatter
  (settles whitespace and style arguments mechanically, so nobody debates them in review).

### What this project deliberately does _not_ use

Just as informative as the list above, because you'll see all of these recommended constantly:

- **No state-management library** (Redux, Zustand, Jotai). This app's convention is that each
  section fetches and owns its own data. That's a deliberate simplicity trade: the cost is that two
  sections showing related data don't automatically stay in sync (a category created in Settings
  isn't instantly known to the Reminders section — which is why that section refetches when its
  form opens). Worth revisiting if cross-section syncing ever becomes common.
- **No data-fetching library** (TanStack Query, SWR). These handle caching, refetching, and
  loading/error states for you. This project does it by hand with `useEffect` + `apiFetch`, which
  is more code per screen but no extra concepts to learn. A larger app would benefit from one.
- **No component library** (MUI, shadcn/ui, Chakra). Components here are hand-written on top of
  Tailwind. That's more initial work, but total control over appearance and no dependency to fight
  when you need something slightly different.

None of these absences are permanent decisions — they're "not needed at this size yet." Knowing
_why_ a tool exists is what lets you recognise the moment you actually need it, rather than
adding it because a tutorial did.

---

## Where to go next

- [Glossary](GLOSSARY.md) — short definitions of individual terms.
- [Implementation log](../IMPLEMENTATION_LOG.md) — how each feature was actually built, in order.
- [Lessons Learned](LESSONS-LEARNED.md) — real bugs from this project, with root causes.
- [Working With AI](WORKING-WITH-AI.md) — habits for building with an AI assistant.

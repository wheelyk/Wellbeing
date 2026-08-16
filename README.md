# WellTrack

WellTrack is a wellness tracking web application for people living with chronic health
conditions. It lets users log symptoms, mood, medications, and daily habits, then review
historical trends over time.

Full product requirements: [Documents/requirements.md](Documents/requirements.md).
Implementation task list: [Tasks.md](Tasks.md).
Running implementation log: [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

## Repository layout

This is a single repository (monorepo) with two independently runnable projects:

```
/frontend   React + TypeScript + Tailwind CSS (Vite)
/backend    Node.js + Express + TypeScript + Prisma
```

The frontend and backend are kept independently testable and deployable — each has its own
`package.json`, dependencies, and environment configuration. They communicate only over the
HTTP API defined in the requirements doc (§12).

### About the `pr-screenshots` branch

If you notice a branch called `pr-screenshots` in the repository that looks unrelated to
everything else — no shared history with `main`, no application code — that's intentional, not
a mistake. It's an orphan branch created and maintained automatically by
[`.github/workflows/pr-preview.yml`](.github/workflows/pr-preview.yml) purely to host the
before/after screenshot images that get embedded in PR review comments. **Don't delete it** —
every screenshot already posted in a past PR comment links to an image stored there, and
removing the branch would break all of those images retroactively. See
[IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) for the full story, including a Vercel
deployment quirk this branch caused and how it was fixed.

## Running locally

1. Start PostgreSQL: `docker compose up -d` (see `docker-compose.yml`).
2. Copy `backend/.env.example` to `backend/.env` — the default `DATABASE_URL` already matches
   `docker-compose.yml`'s credentials, but generate your own `JWT_ACCESS_SECRET` and
   `JWT_REFRESH_SECRET` (a command for doing that is in the example file's comments — never
   commit real secret values).
3. Install dependencies, apply migrations (creates the database tables — only needed once, or
   whenever a new migration is added), then run the backend:
   ```
   cd backend
   npm install
   npx prisma migrate dev
   npm run dev
   ```
   (`npm run dev` itself doesn't apply migrations automatically — only the production `npm
   start` script does, via `prisma migrate deploy`.)
4. Copy `frontend/.env.example` to `frontend/.env` (the default already points at the backend's
   local dev URL, `http://localhost:4000`).
5. Install and run the frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```
6. Open `http://localhost:5173` and register an account.

Each project also has `npm test`, `npm run lint`, `npm run format:check` — see
[IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) for what each one does and why.

## Status

Early-stage MVP under active development. See [Tasks.md](Tasks.md) for the current
implementation plan and progress. A live deployment tracking `main` runs at
[wellbeing-blue.vercel.app](https://wellbeing-blue.vercel.app) (frontend, on Vercel), backed by
a Node/Express API on Railway.

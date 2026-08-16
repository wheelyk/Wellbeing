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

> Scaffolding for `/frontend` and `/backend` is added in later setup tasks (see
> [Tasks.md](Tasks.md), Phase 0). Once in place, local setup will be:

1. Start PostgreSQL (see `docker-compose.yml`, once added).
2. Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` and JWT secrets.
3. Install and run the backend:
   ```
   cd backend
   npm install
   npm run dev
   ```
4. Copy `frontend/.env.example` to `frontend/.env` and set the backend API URL.
5. Install and run the frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```

## Status

Early-stage MVP under active development. See [Tasks.md](Tasks.md) for the current
implementation plan and progress.

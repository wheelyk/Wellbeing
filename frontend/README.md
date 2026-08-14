# WellTrack — Frontend

React + TypeScript frontend, built with [Vite](https://vite.dev/) and styled with
[Tailwind CSS](https://tailwindcss.com/).

See the root [README.md](../README.md) for the overall project layout, and
[../Documents/requirements.md](../Documents/requirements.md) for product requirements.

## Local development

```
cp .env.example .env   # set VITE_API_URL to point at the running backend
npm install
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server with hot reload.
- `npm run build` — type-check and build a production bundle into `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run lint` — run Oxlint.

# Cards

A phone companion for in-person card games. Everyone at the table joins a **Room** on their phone, and passes **Chips** to each other by pointing their phone at someone, or by tapping them. Like a real deck and set of chips, it tracks Chips, not game rules, so any game works.

- **Live:** https://stevenocchipinti.github.io/cards/
- **What v1 does:** [docs/PRD.md](docs/PRD.md)
- **Vocabulary:** [GLOSSARY.md](GLOSSARY.md). Use these words everywhere.
- **Progress:** [GitHub issues](https://github.com/stevenocchipinti/cards/issues)

## Stack

Vite, React 19, TypeScript and TanStack Router on the frontend. [Convex](https://convex.dev) is the backend (database, server functions and realtime sync). The site is hosted on GitHub Pages.

## Setup

```sh
npm install
npx convex dev   # logs in, pushes convex/ on every save, writes .env.local
npm run dev      # in a second terminal: http://localhost:5173/cards/
```

`.env.local` needs `VITE_CONVEX_URL` set to the same URL as `CONVEX_URL`. `npx convex dev` writes `CONVEX_URL`; copy it across if `VITE_CONVEX_URL` is missing.

To test on a phone, open the dev server's network URL (`server.host` is on). The compass only works over HTTPS, so test compass mode on the deployed site, or use Chrome DevTools › Sensors to fake one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run convex` | `convex dev`: syncs `convex/` to your dev deployment |
| `npm test` | Vitest: Convex function tests (`convex-test`) and pure logic tests |
| `npm run typecheck` | `tsc` over `src/` and `convex/` |
| `npm run build` | Production build into `dist/`, with `404.html` so routes work on GitHub Pages |

## Deploying

Every push to `main` runs [the workflow](.github/workflows/pages.yml): it typechecks, runs the tests, builds, and publishes to GitHub Pages.

- If the repo has a `CONVEX_DEPLOY_KEY` secret (a **production** deploy key from the Convex dashboard), the workflow also deploys `convex/` to production and builds the site against it.
- Without that secret, the site is built against the dev deployment in the repo variable `VITE_CONVEX_URL`.

## Compass

The heading-sensor code started as a standalone demo, kept at [legacy/compass-demo.html](legacy/compass-demo.html). It reads every orientation source a browser offers and picks the best one. Its notes on which browser supports which source are still accurate.

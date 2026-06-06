# Versus

Real-time, lobby-based multiplayer web game: snake draft of NBA player-seasons, mulligans, then simulated box-score results.

**Hosting:** static SPA on GitHub Pages. Multiplayer uses PeerJS (host-authoritative state) or local `BroadcastChannel` for two-tab testing.

## Why player data isn't fetched live from Kaggle in the browser

GitHub Pages serves **static files only** — no Node, no servers, no secrets.

| Stage | What happens |
|-------|----------------|
| **Build / CI** | `npm run data:build` downloads the [Kaggle dataset](https://www.kaggle.com/datasets/eoinamoore/historical-nba-data-and-player-box-scores) via its public API URL, aggregates full-history player-seasons (~9.5k), writes `public/data/players.json` |
| **Deploy** | Vite copies `public/data/` into `dist/data/` |
| **Runtime (browser)** | App `fetch`es `/data/players.json` from the same origin — works on GitHub Pages |

The raw Kaggle zip is ~450MB of game logs. Aggregating that in a browser tab would be slow and unreliable. The build step is automatic (not a manual download); you only run it when refreshing data.

`public/data/players.json` is **committed** so `npm run dev` works offline without re-downloading.

## Local dev

```bash
npm install
npm run dev
```

### Local testing (recommended)

1. **Connection mode → Local testing**
2. Tab 1: Create lobby → copy code
3. Tab 2: Join with code

### Refresh player data from Kaggle

```bash
npm run data:build
```

Uses `.cache/` after the first run (fast). Do **not** append shell comments to npm scripts — run exactly:

```bash
npm run data:build
```

## Deploy to GitHub Pages

### Option A — GitHub Actions (recommended)

Push to `main`. The workflow in `.github/workflows/deploy-pages.yml`:

1. Runs `data:build` (pulls Kaggle data in CI)
2. Builds the Vite app
3. Deploys to GitHub Pages

Enable Pages in repo settings: **Source → GitHub Actions**.

### Option B — Manual

```bash
GITHUB_PAGES=true npm run build
npm run deploy
```

Set Pages source to the `gh-pages` branch.

Pages `base` is derived from your GitHub repo name in CI. For local deploys, set `PAGES_BASE` if needed.

## Architecture

| Layer | Role |
|-------|------|
| `scripts/build-players.mjs` | Download + aggregate Kaggle CSV → `public/data/players.json` |
| `src/game/playerPool.ts` | Runtime `fetch` of static JSON |
| `src/game/` | Engine, draft, simulation |
| `src/network/` | Local (BroadcastChannel) or PeerJS transport |

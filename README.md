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

### Online mode (two devices / browsers)

Online uses **PeerJS** and needs a small **signaling server** (GitHub Pages alone cannot host it).

**Local online test:**

```bash
npm run dev:online
```

Starts the Peer server on port 9000 and Vite. Both tabs: **Online (PeerJS)**.

**Production (GitHub Pages + Render):**

Step-by-step: **[docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)**

1. Deploy signaling server on Render (`render.yaml` blueprint).
2. Add GitHub Actions secrets: `VITE_PEER_HOST`, `VITE_PEER_PORT` (`443`), `VITE_PEER_SECURE` (`true`).
3. Push to `main` to rebuild GitHub Pages.

Players see a **Connecting** screen while the link is made (including Render cold starts).

### Refresh player data from Kaggle

```bash
npm run data:build
```

Uses `.cache/` after the first run (fast). Do **not** append shell comments to npm scripts — run exactly:

```bash
npm run data:build
```

## Deploy to GitHub Pages

Deploys from **`main`** via GitHub Actions (no `gh-pages` branch).

1. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
2. Add Actions secrets for online mode (see [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md))
3. Push to `main` (or run **Deploy GitHub Pages** workflow manually in the Actions tab)

The workflow in `.github/workflows/deploy-pages.yml` runs `data:build`, builds the Vite app, and publishes `dist/`.

Pages `base` is derived from your GitHub repo name in CI. For local production builds, set `PAGES_BASE` if needed.

### Remove old `gh-pages` branch (one-time)

If you previously used branch-based Pages:

1. Confirm **Source** is **GitHub Actions** (not “Deploy from a branch”).
2. Delete the orphan branch:
   ```bash
   git push origin --delete gh-pages
   ```
3. On GitHub: **Branches** → delete `gh-pages` if it still appears.

## Architecture

| Layer | Role |
|-------|------|
| `scripts/build-players.mjs` | Download + aggregate Kaggle CSV → `public/data/players.json` |
| `src/game/playerPool.ts` | Runtime `fetch` of static JSON |
| `src/game/` | Engine, draft, simulation |
| `src/network/` | Local (BroadcastChannel) or PeerJS transport |

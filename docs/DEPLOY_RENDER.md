# Deploy online mode (Render + GitHub Pages)

Online play needs a tiny **PeerJS signaling server**. The game still runs in the **host's browser**; Render only helps two browsers find each other.

## 1. Deploy the signaling server on Render

1. Sign in at [render.com](https://render.com).
2. **New → Blueprint**.
3. Connect this GitHub repo.
4. Render reads `render.yaml` and creates **versus-peer-server**.
5. Wait until the service status is **Live**.
6. Copy the hostname (e.g. `versus-peer-server.onrender.com`).

**Free tier:** the service sleeps after ~15 minutes idle. The first player connection after sleep may take up to a minute (the app shows a Connecting screen during this).

## 2. Point the game at your Render host

**Option A — `public/peer-config.json` (simplest)**

Edit `public/peer-config.json` with your Render hostname, commit, and push to `main`:

```json
{
  "host": "versus-peer-server.onrender.com",
  "port": 443,
  "path": "/",
  "secure": true
}
```

Replace the hostname if your Render service name differs.

**Option B — GitHub Actions secrets** (baked into the JS bundle at build time)

| Secret | Example value |
|--------|----------------|
| `VITE_PEER_HOST` | `versus-peer-server.onrender.com` |
| `VITE_PEER_PORT` | `443` |
| `VITE_PEER_SECURE` | `true` |

Do **not** add an empty `VITE_PEER_PATH` secret — omit it entirely (defaults to `/`). An empty value breaks the WebSocket URL.

Build checks env first, then falls back to `peer-config.json`.

## 3. Deploy the game (GitHub Pages)

Deployment is **from `main` only** via GitHub Actions — not the `gh-pages` branch.

1. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
2. Push to `main`, or run **Deploy GitHub Pages** workflow manually.

If an old `gh-pages` branch exists from a previous setup, delete it after switching the source:

```bash
git push origin --delete gh-pages
```

## 4. Play

1. Open your Pages URL on two devices/browsers.
2. Choose **Online (PeerJS)**.
3. Host: **Create lobby** → share code.
4. Guest: **Join lobby** with the code.

Both players see a **Connecting** screen while the link is established.

## Local online test (no Render)

```bash
npm run dev:online
```

Uses `localhost:9000` for signaling. Both tabs: **Online (PeerJS)**.

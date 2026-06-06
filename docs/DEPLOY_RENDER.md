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

## 2. Wire the static site build

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example value |
|--------|----------------|
| `VITE_PEER_HOST` | `versus-peer-server.onrender.com` |
| `VITE_PEER_PORT` | `443` |
| `VITE_PEER_SECURE` | `true` |

Optional: `VITE_PEER_PATH` = `/` (default)

## 3. Deploy the game (GitHub Pages)

Push to `main`, or run the **Deploy GitHub Pages** workflow manually.

Ensure **Settings → Pages → Source** is **GitHub Actions**.

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

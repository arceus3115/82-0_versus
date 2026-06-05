# Versus — 82–0 Draft + Streak

Real-time, lobby-based multiplayer web game: snake draft of NBA player-seasons, mulligans, then synchronized streak simulation.

**Hosting:** static SPA on GitHub Pages. Multiplayer uses PeerJS (one player hosts authoritative game state over WebRTC data channels).

## Features

- Lobby with join code, ready status, 2–12 players
- Snake draft with 5-card offers per pick (15s timer + auto-pick)
- Full mulligan + year mulligan (once each) after draft
- Synchronized simulation rounds with seeded RNG
- Modes: Last Man Standing or Fixed Season (18 rounds)
- Hidden μ/σ/τ model; UI shows statlines + Stable/Volatile/Risky only

## Local dev

```bash
npm install
npm run dev
```

Open two browser tabs/windows to test host + guest.

## Deploy to GitHub Pages

```bash
npm run deploy
```

Then enable GitHub Pages for this repo (branch `gh-pages`, root `/`).

The build uses base path `/82-0_versus/` — rename in `vite.config.ts` if your repo name differs.

## Architecture

| Layer | Role |
|-------|------|
| `src/game/` | Deterministic engine: model, draft, simulation, seeded RNG |
| `src/network/` | PeerJS host/guest connections |
| `src/components/` | Lobby, draft, mulligan, simulation, results UI |

The **host** runs `GameEngine` and broadcasts `LobbyState` to guests after every action.

## Data

`src/data/players.json` — 119 player-season rows (Basketball Reference–style fields: PTS, AST, TRB, STL, BLK, MP, BPM, TS%, TOV%).

## Notes

- PeerJS uses the public signaling server (`0.peerjs.com`). For production, consider self-hosting PeerServer.
- Sessions are ephemeral; no persistence in v1.

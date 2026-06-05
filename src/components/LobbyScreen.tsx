import type { GameMode, LobbyState } from "../game/types";

interface Props {
  state: LobbyState;
  playerId: string | null;
  isHost: boolean;
  onReady: () => void;
  onStart: (mode: GameMode) => void;
}

export function LobbyScreen({ state, playerId, isHost, onReady, onStart }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const allReady = state.players.length >= 2 && state.players.every((p) => p.ready);

  return (
    <section className="screen lobby-screen">
      <div className="hero-card">
        <p className="eyebrow">Join code</p>
        <h1 className="join-code">{state.code}</h1>
        <p className="subcopy">Share this code. Need 2–12 players.</p>
      </div>

      <div className="panel">
        <h2>Players</h2>
        <ul className="player-list">
          {state.players.map((player) => (
            <li key={player.id} className={player.ready ? "ready" : ""}>
              <span>{player.name}{player.isHost ? " (host)" : ""}</span>
              <span>{player.ready ? "Ready" : "Waiting"}</span>
            </li>
          ))}
        </ul>
      </div>

      {me && !me.ready && (
        <button className="btn btn-primary" onClick={onReady}>
          I&apos;m Ready
        </button>
      )}

      {isHost && (
        <div className="panel">
          <h2>Game mode</h2>
          <div className="mode-buttons">
            <button
              className="btn btn-secondary"
              disabled={!allReady}
              onClick={() => onStart("elimination")}
            >
              Last Man Standing
            </button>
            <button
              className="btn btn-primary"
              disabled={!allReady}
              onClick={() => onStart("fixed_season")}
            >
              Fixed Season (18 rounds)
            </button>
          </div>
        </div>
      )}

      {!isHost && me?.ready && (
        <p className="waiting-host">Waiting for host to start…</p>
      )}
    </section>
  );
}

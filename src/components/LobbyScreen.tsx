import type { LobbyState } from "../game/types";

interface Props {
  state: LobbyState;
  playerId: string | null;
  isHost: boolean;
  onReady: () => void;
  onStart: () => void;
}

export function LobbyScreen({ state, playerId, isHost, onReady, onStart }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const allReady = state.players.length === 2 && state.players.every((p) => p.ready);

  return (
    <section className="screen lobby-screen">
      <div className="hero-card">
        <p className="eyebrow">Join code</p>
        <h1 className="join-code">{state.code}</h1>
        <p className="subcopy">Share this code. Exactly 2 players.</p>
      </div>

      <div className="panel">
        <h2>Players</h2>
        <ul className="player-list">
          {state.players.map((player) => (
            <li key={player.id} className={player.ready ? "ready" : ""}>
              <span>
                {player.name}
                {player.isHost ? " (host)" : ""}
              </span>
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
        <button className="btn btn-primary btn-large" disabled={!allReady} onClick={onStart}>
          Start draft
        </button>
      )}

      {!isHost && me?.ready && <p className="waiting-host">Waiting for host to start…</p>}
    </section>
  );
}

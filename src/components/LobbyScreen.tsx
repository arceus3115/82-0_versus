import { MAX_PLAYERS, MIN_PLAYERS } from "../game/draft";
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
  const count = state.players.length;
  const allReady = count >= MIN_PLAYERS && state.players.every((p) => p.ready);
  const lobbyFull = count >= MAX_PLAYERS;

  return (
    <section className="screen lobby-screen">
      <div className="hero-card">
        <p className="eyebrow">Join code</p>
        <h1 className="join-code">{state.code}</h1>
        <p className="subcopy">
          Share this code. {MIN_PLAYERS}–{MAX_PLAYERS} players ({count}/{MAX_PLAYERS}).
        </p>
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

      {lobbyFull && <p className="waiting-host">Lobby is full.</p>}

      {!isHost && me?.ready && <p className="waiting-host">Waiting for host to start…</p>}
    </section>
  );
}

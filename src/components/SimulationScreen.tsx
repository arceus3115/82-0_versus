import type { LobbyState } from "../game/types";

interface Props {
  state: LobbyState;
  playerId: string | null;
  isHost: boolean;
  onSimulate: () => void;
}

export function SimulationScreen({ state, playerId, isHost, onSimulate }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const activePlayers = state.players.filter((p) => !p.eliminated);

  return (
    <section className="screen simulation-screen">
      <div className="streak-hero">
        <p className="eyebrow">Current streak</p>
        <h1 className="streak-number">{me?.streak ?? 0}</h1>
        <p className="subcopy">
          Round {state.simulationRound}
          {state.mode === "fixed_season" ? ` / ${state.maxRounds}` : ""}
        </p>
      </div>

      <div className="panel leaderboard">
        <h3>Live standings</h3>
        <ul>
          {[...state.players]
            .sort((a, b) => b.streak - a.streak)
            .map((player) => (
              <li key={player.id} className={player.eliminated ? "eliminated" : ""}>
                <span>{player.name}</span>
                <span>
                  {player.eliminated ? "OUT" : `${player.streak} streak`}
                </span>
              </li>
            ))}
        </ul>
      </div>

      {state.lastOutcomes.length > 0 && (
        <div className="panel feed-panel">
          <h3>Last round</h3>
          <ul className="feed">
            {state.lastOutcomes.map((outcome) => {
              const player = state.players.find((p) => p.id === outcome.playerId);
              return (
                <li key={`${outcome.playerId}-${outcome.round}`}>
                  <strong>{player?.name}</strong> — {outcome.won ? "W" : "L"}: {outcome.flavor}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="panel feed-panel">
        <h3>Game feed</h3>
        <ul className="feed">
          {state.feed.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      {isHost && activePlayers.length > 0 && state.phase === "simulating" && (
        <button className="btn btn-primary btn-large" onClick={onSimulate}>
          Simulate next round
        </button>
      )}

      {!isHost && <p className="waiting-host">Host advances each round…</p>}
    </section>
  );
}

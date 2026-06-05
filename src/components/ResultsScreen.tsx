import { rarityPercentile } from "../game/simulate";
import type { LobbyState } from "../game/types";

interface Props {
  state: LobbyState;
}

export function ResultsScreen({ state }: Props) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const sorted = [...state.players].sort((a, b) => b.maxStreak - a.maxStreak);

  return (
    <section className="screen results-screen">
      <div className="hero-card winner-card">
        <p className="eyebrow">Winner</p>
        <h1>{winner?.name ?? "—"}</h1>
        <p className="subcopy">
          {state.mode === "elimination" ? "Last undefeated run" : "Highest streak in 18 rounds"}
        </p>
      </div>

      <div className="panel">
        <h3>Final streaks</h3>
        <ul className="player-list">
          {sorted.map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              <span>
                {player.maxStreak} max · {rarityPercentile(player.maxStreak)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="seed-note">RNG seed: {state.rngSeed} (reproducible run)</p>
    </section>
  );
}

import type { LobbyState } from "../game/types";
import { CourtRoster } from "./CourtRoster";
import { PredictedStatlineCompare } from "./PredictedStatline";

interface Props {
  state: LobbyState;
  onPlayAgain: () => void;
}

export function ResultsScreen({ state, onPlayAgain }: Props) {
  const isTie = state.result?.isTie ?? false;
  const winner = state.players.find((p) => p.id === state.winnerId);

  return (
    <section className="finalize-screen results-screen">
      <div className="surface-panel surface-panel--hero finalize-hero">
        <p className="eyebrow">{isTie ? "Final" : "Winner"}</p>
        <h1>{isTie ? "Tie game" : (winner?.name ?? "—")}</h1>
      </div>

      {state.result && (
        <PredictedStatlineCompare
          lines={state.result.predictedStatlines}
          winnerId={state.winnerId}
        />
      )}

      <div className="lineup-split">
        {state.players.map((player) => (
          <article
            key={player.id}
            className={`lineup-card ${player.id === state.winnerId ? "lineup-card--winner" : ""}`}
          >
            <header className="lineup-card__header">
              <h3>{player.name}</h3>
              {player.id === state.winnerId && <span className="status-ready">Winner</span>}
              {isTie && <span className="status-wait">Tied</span>}
            </header>
            <div className="lineup-card__body">
              <CourtRoster team={player.team} />
            </div>
          </article>
        ))}
      </div>

      <div className="finalize-actions">
        <button className="btn btn-primary btn-large" onClick={onPlayAgain}>
          Play again
        </button>
        <p className="seed-note">RNG seed: {state.rngSeed}</p>
      </div>
    </section>
  );
}

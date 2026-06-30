import { getFinishOrder } from "../game/bracket";
import type { LobbyState } from "../game/types";
import { BracketBoard } from "./BracketBoard";
import { CourtRoster } from "./CourtRoster";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onPlayAgain: () => void;
}

function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

export function ResultsScreen({ state, playerId, onPlayAgain }: Props) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const finishOrder = state.tournament ? getFinishOrder(state.tournament) : [];
  const myRank = playerId ? finishOrder.indexOf(playerId) + 1 : 0;
  const isSolo = state.gameMode === "solo";

  return (
    <section className="finalize-screen results-screen">
      <div className="surface-panel surface-panel--hero finalize-hero">
        <p className="eyebrow">Champion</p>
        <h1>{winner?.name ?? "—"}</h1>
        {isSolo && myRank > 0 && (
          <p className="subcopy">
            You finished {ordinal(myRank)} of {state.players.length}
          </p>
        )}
      </div>

      {isSolo && finishOrder.length > 0 && (
        <div className="surface-panel">
          <div className="surface-panel__header">
            <h3>Final standings</h3>
          </div>
          <ol className="standings-list">
            {finishOrder.map((id, index) => {
              const player = state.players.find((p) => p.id === id);
              const isMe = id === playerId;
              return (
                <li
                  key={id}
                  className={`standings-list__item ${isMe ? "standings-list__item--you" : ""}`}
                >
                  <span className="standings-list__rank">{ordinal(index + 1)}</span>
                  <span className="standings-list__name">
                    {player?.name ?? "—"}
                    {isMe ? " (you)" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <BracketBoard state={state} title="Tournament bracket" />

      <div className="lineup-split">
        {state.players.map((player) => (
          <article
            key={player.id}
            className={`lineup-card ${player.id === state.winnerId ? "lineup-card--winner" : ""}`}
          >
            <header className="lineup-card__header">
              <h3>{player.name}</h3>
              {player.id === state.winnerId && <span className="status-ready">Champion</span>}
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

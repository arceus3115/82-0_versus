import { useEffect, useState } from "react";
import type { LobbyState } from "../game/types";
import { Statline } from "./Statline";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onPick: (cardId: string) => void;
}

export function DraftScreen({ state, playerId, onPick }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const currentPickerId = state.draftOrder[state.currentPickIndex];
  const isMyTurn = currentPickerId === playerId;
  const picker = state.players.find((p) => p.id === currentPickerId);
  const pickNumber = state.currentPickIndex + 1;

  useEffect(() => {
    if (!state.pickDeadline) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.pickDeadline! - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.pickDeadline, state.currentPickIndex]);

  const me = state.players.find((p) => p.id === playerId);

  return (
    <section className="screen draft-screen">
      <div className="draft-meta">
        <div>
          <p className="eyebrow">Snake draft</p>
          <h2>
            Pick {pickNumber} / {state.totalDraftPicks}
          </h2>
        </div>
        <div className="timer-ring">{secondsLeft}s</div>
      </div>

      <p className="turn-banner">
        {isMyTurn ? "Your pick — choose one card" : `Waiting on ${picker?.name ?? "…"}`}
      </p>

      <div className="card-grid">
        {state.offeredCards.map((card) => (
          <button
            key={card.id}
            className="draft-card"
            disabled={!isMyTurn}
            onClick={() => onPick(card.id)}
          >
            <Statline card={card} />
          </button>
        ))}
      </div>

      {me && me.team.length > 0 && (
        <div className="panel roster-panel">
          <h3>Your roster ({me.team.length}/5)</h3>
          <div className="roster-grid">
            {me.team.map((card) => (
              <Statline key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

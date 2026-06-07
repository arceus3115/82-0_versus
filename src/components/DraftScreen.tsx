import { useEffect, useRef, useState } from "react";
import type { LobbyState } from "../game/types";
import { playTimerTick } from "../utils/tickSound";
import { CourtRoster } from "./CourtRoster";
import { MulliganBar } from "./MulliganBar";
import { Statline } from "./Statline";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onPick: (cardId: string) => void;
  onMulliganFull: () => void;
  onMulliganYear: () => void;
  onSwap: (fromIndex: number, toIndex: number) => void;
}

export function DraftScreen({
  state,
  playerId,
  onPick,
  onMulliganFull,
  onMulliganYear,
  onSwap,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastBeepSecond = useRef(-1);

  const currentPickerId = state.draftOrder[state.currentPickIndex];
  const isMyTurn = currentPickerId === playerId;
  const picker = state.players.find((p) => p.id === currentPickerId);
  const others = state.players.filter((p) => p.id !== playerId);
  const me = state.players.find((p) => p.id === playerId);
  const pickNumber = state.currentPickIndex + 1;

  useEffect(() => {
    if (!state.pickDeadline) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((state.pickDeadline! - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.pickDeadline, state.currentPickIndex]);

  useEffect(() => {
    if (!isMyTurn || secondsLeft <= 0 || secondsLeft > 5) return;
    if (lastBeepSecond.current === secondsLeft) return;
    lastBeepSecond.current = secondsLeft;
    playTimerTick();
  }, [secondsLeft, isMyTurn]);

  useEffect(() => {
    if (secondsLeft > 5) lastBeepSecond.current = -1;
  }, [secondsLeft, state.currentPickIndex]);

  return (
    <div className="draft-shell">
      <aside className="surface-panel draft-panel--history">
        <div className="surface-panel__header">
          <h3>Recent picks</h3>
        </div>
        <div className="surface-panel__body">
          {state.lastPick ? (
            <div className="pick-card">
              <p className="pick-card__meta">
                #{state.lastPick.pickNumber} · {state.lastPick.drafterName}
              </p>
              <Statline card={state.lastPick.card} compact />
            </div>
          ) : (
            <p className="panel-empty">No picks yet.</p>
          )}
          <ul className="pick-history">
            {state.pickHistory.slice(1, 5).map((pick) => (
              <li key={`${pick.pickNumber}-${pick.card.id}`}>
                <span>
                  #{pick.pickNumber} {pick.drafterName}
                </span>
                <span>{pick.card.player_name}</span>
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <div className="opponent-block">
              <h4 className="panel-subtitle">Other drafters</h4>
              {others.map((other) => (
                <div key={other.id} className="opponent-group">
                  <h5 className="opponent-group__name">{other.name}</h5>
                  <ul className="opponent-picks">
                    {other.team.map((card) => (
                      <li key={card.id}>
                        <span className="team-ticker team-ticker--inline">{card.team_ticker}</span>
                        {card.player_name}
                      </li>
                    ))}
                    {other.team.length === 0 && <li className="panel-empty">Waiting…</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="surface-panel draft-panel--main">
        <header
          className={`surface-panel__header pick-banner ${isMyTurn ? "pick-banner--you" : "pick-banner--wait"}`}
        >
          <div className="pick-banner__text">
            <p className="eyebrow">
              {state.players.length > 2 ? "Snake" : "Back & forth"} · Pick {pickNumber}/
              {state.totalDraftPicks}
            </p>
            <h2>{isMyTurn ? "You're on the clock" : `Waiting on ${picker?.name}`}</h2>
          </div>
          <div className={`timer-badge ${secondsLeft <= 5 ? "timer-badge--urgent" : ""}`}>
            {secondsLeft}s
          </div>
        </header>

        {isMyTurn && state.offeredCards.length > 0 && me && (
          <MulliganBar
            fullUsed={me.mulligan.fullUsed}
            yearUsed={me.mulligan.yearUsed}
            onMulliganFull={onMulliganFull}
            onMulliganYear={onMulliganYear}
          />
        )}

        <div className={`offer-grid ${!isMyTurn ? "offer-grid--disabled" : ""}`}>
          {state.offeredCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="offer-card"
              disabled={!isMyTurn}
              onClick={() => onPick(card.id)}
            >
              <Statline card={card} />
            </button>
          ))}
        </div>
      </section>

      <aside className="surface-panel draft-panel--roster">
        {me && (
          <CourtRoster
            team={me.team}
            title={`Your starting 5 (${me.team.length}/5)`}
            interactive
            onSwap={onSwap}
          />
        )}
      </aside>
    </div>
  );
}

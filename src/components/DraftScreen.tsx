import { useEffect, useRef, useState } from "react";
import type { LobbyState } from "../game/types";
import { playTimerTick } from "../utils/tickSound";
import { CourtRoster } from "./CourtRoster";
import { Statline } from "./Statline";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onPick: (cardId: string) => void;
  onMulliganFull: () => void;
  onMulliganYear: (playerName: string) => void;
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
  const [yearTarget, setYearTarget] = useState("");
  const lastBeepSecond = useRef(-1);

  const currentPickerId = state.draftOrder[state.currentPickIndex];
  const isMyTurn = currentPickerId === playerId;
  const picker = state.players.find((p) => p.id === currentPickerId);
  const opponent = state.players.find((p) => p.id !== playerId);
  const me = state.players.find((p) => p.id === playerId);
  const pickNumber = state.currentPickIndex + 1;
  const draftLabel = state.players.length === 2 ? "Alternating" : "Snake";

  useEffect(() => {
    const first = state.offeredCards[0]?.player_name ?? "";
    setYearTarget(first);
  }, [state.offeredCards, state.currentPickIndex]);

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
                <span>#{pick.pickNumber} {pick.drafterName}</span>
                <span>{pick.card.player_name}</span>
              </li>
            ))}
          </ul>
          {opponent && (
            <div className="opponent-block">
              <h4 className="panel-subtitle">{opponent.name}&apos;s picks</h4>
              <ul className="opponent-picks">
                {opponent.team.map((card) => (
                  <li key={card.id}>
                    <span className="team-ticker team-ticker--inline">{card.team_ticker}</span>
                    {card.player_name}
                  </li>
                ))}
                {opponent.team.length === 0 && <li className="panel-empty">Waiting…</li>}
              </ul>
            </div>
          )}
        </div>
      </aside>

      <section className="surface-panel draft-panel--main">
        <header className={`surface-panel__header pick-banner ${isMyTurn ? "pick-banner--you" : "pick-banner--wait"}`}>
          <div className="pick-banner__text">
            <p className="eyebrow">{draftLabel} · Pick {pickNumber}/{state.totalDraftPicks}</p>
            <h2>{isMyTurn ? "You're on the clock" : `Waiting on ${picker?.name}`}</h2>
          </div>
          <div className={`timer-badge ${secondsLeft <= 5 ? "timer-badge--urgent" : ""}`}>
            {secondsLeft}s
          </div>
        </header>

        {isMyTurn && state.offeredCards.length > 0 && me && (
          <div className="mulligan-bar">
            <p className="mulligan-label">Mulligan choices before you pick</p>
            <div className="mulligan-controls">
              <button
                className="btn btn-secondary btn-sm"
                disabled={me.mulligan.fullUsed}
                onClick={onMulliganFull}
              >
                Reroll all 5 ({me.mulligan.fullUsed ? "used" : "1 left"})
              </button>
              <div className="mulligan-year">
                <select
                  value={yearTarget}
                  disabled={me.mulligan.yearUsed}
                  onChange={(e) => setYearTarget(e.target.value)}
                >
                  {state.offeredCards.map((card) => (
                    <option key={card.id} value={card.player_name}>
                      {card.player_name} ({card.season})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={me.mulligan.yearUsed || !yearTarget}
                  onClick={() => onMulliganYear(yearTarget)}
                >
                  Reroll year ({me.mulligan.yearUsed ? "used" : "1 left"})
                </button>
              </div>
            </div>
          </div>
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

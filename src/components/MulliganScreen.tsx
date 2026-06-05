import { useState } from "react";
import type { LobbyState } from "../game/types";
import { Statline } from "./Statline";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onFull: () => void;
  onYear: (playerName: string) => void;
  onSkip: () => void;
}

export function MulliganScreen({ state, playerId, onFull, onYear, onSkip }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const [yearTarget, setYearTarget] = useState(me?.team[0]?.player_name ?? "");

  if (!me) return null;

  const canAct = !me.mulligan.done;

  return (
    <section className="screen mulligan-screen">
      <div className="hero-card">
        <p className="eyebrow">Mulligan window</p>
        <h2>Reroll now or lock in</h2>
        <p className="subcopy">Use immediately after draft. One full + one year mulligan per player.</p>
      </div>

      <div className="panel">
        <h3>Your roster</h3>
        <div className="roster-grid">
          {me.team.map((card) => (
            <Statline key={card.id} card={card} />
          ))}
        </div>
      </div>

      {canAct ? (
        <div className="mulligan-actions">
          <button
            className="btn btn-secondary"
            disabled={me.mulligan.fullUsed}
            onClick={onFull}
          >
            Full mulligan (reroll all 5)
          </button>

          <div className="year-row">
            <select value={yearTarget} onChange={(e) => setYearTarget(e.target.value)}>
              {me.team.map((card) => (
                <option key={card.id} value={card.player_name}>
                  {card.player_name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={me.mulligan.yearUsed}
              onClick={() => onYear(yearTarget)}
            >
              Year mulligan
            </button>
          </div>

          <button className="btn btn-primary" onClick={onSkip}>
            Skip mulligans
          </button>
        </div>
      ) : (
        <p className="waiting-host">Mulligan locked — waiting for other players…</p>
      )}
    </section>
  );
}

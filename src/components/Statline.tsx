import type { DisplayCard } from "../game/types";

export function Statline({ card, compact = false }: { card: DisplayCard; compact?: boolean }) {
  return (
    <article className={`statline ${compact ? "statline--compact" : ""}`}>
      <header className="statline-header">
        <div className="statline-identity">
          <h3 className="statline-name">{card.player_name}</h3>
          <p className="statline-meta">
            {card.positions.length > 0 && (
              <span className="statline-positions">{card.positions.join(" · ")}</span>
            )}
            <span className="statline-season">{card.season}</span>
          </p>
        </div>
        <span className="team-ticker" title={`${card.team_ticker} · ${card.season}`}>
          {card.team_ticker}
        </span>
      </header>
      <dl className="stats-grid">
        <div>
          <dt>PTS</dt>
          <dd>{card.PTS}</dd>
        </div>
        <div>
          <dt>AST</dt>
          <dd>{card.AST}</dd>
        </div>
        <div>
          <dt>TRB</dt>
          <dd>{card.TRB}</dd>
        </div>
        <div>
          <dt>STL</dt>
          <dd>{card.STL}</dd>
        </div>
        <div>
          <dt>BLK</dt>
          <dd>{card.BLK}</dd>
        </div>
      </dl>
    </article>
  );
}

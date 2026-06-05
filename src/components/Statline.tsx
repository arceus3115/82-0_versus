import type { DisplayCard } from "../game/types";

const tierClass: Record<string, string> = {
  Stable: "tier-stable",
  Volatile: "tier-volatile",
  Risky: "tier-risky",
};

export function Statline({ card }: { card: DisplayCard }) {
  return (
    <div className="statline">
      <div className="statline-header">
        <div>
          <h3>{card.player_name}</h3>
          <p className="season">{card.season}</p>
        </div>
        <span className={`tier ${tierClass[card.tier]}`}>{card.tier}</span>
      </div>
      <div className="stats-grid">
        <span>PTS {card.PTS}</span>
        <span>AST {card.AST}</span>
        <span>TRB {card.TRB}</span>
        <span>STL {card.STL}</span>
        <span>BLK {card.BLK}</span>
      </div>
    </div>
  );
}

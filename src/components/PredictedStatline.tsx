import type { PredictedStatline as PredictedStatlineType } from "../game/types";

const STAT_KEYS = ["PTS", "AST", "TRB", "STL", "BLK"] as const;

interface Props {
  lines: PredictedStatlineType[];
  winnerId: string | null;
  embedded?: boolean;
  compact?: boolean;
  title?: string;
}

export function PredictedStatlineCompare({
  lines,
  winnerId,
  embedded = false,
  compact = false,
  title,
}: Props) {
  if (lines.length < 2) return null;

  const [a, b] = lines;

  const table = (
    <div className={`predicted-table-wrap ${compact ? "predicted-table-wrap--compact" : ""}`}>
      <table className={`predicted-table ${compact ? "predicted-table--compact" : ""}`}>
        <colgroup>
          <col className="label-col" />
          <col className="stat-col" />
          <col className="stat-col" />
        </colgroup>
        <thead>
          <tr>
            <th>Stat</th>
            <th className={a.playerId === winnerId ? "predicted-table__winner" : ""}>
              {a.playerName}
            </th>
            <th className={b.playerId === winnerId ? "predicted-table__winner" : ""}>
              {b.playerName}
            </th>
          </tr>
        </thead>
        <tbody>
          {STAT_KEYS.map((key) => {
            const av = a[key];
            const bv = b[key];
            const aWins = av > bv;
            const bWins = bv > av;
            return (
              <tr key={key}>
                <td>{key}</td>
                <td className={aWins ? "predicted-table__leader" : ""}>{av}</td>
                <td className={bWins ? "predicted-table__leader" : ""}>{bv}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return (
      <div className={`predicted-embedded ${compact ? "predicted-embedded--compact" : ""}`}>
        {title ? <p className="predicted-embedded__title">{title}</p> : null}
        {table}
      </div>
    );
  }

  return (
    <section className="surface-panel predicted-panel">
      <div className="surface-panel__header">
        <h3>{title ?? "Game box score"}</h3>
      </div>
      {table}
    </section>
  );
}

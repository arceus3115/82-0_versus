import { MulliganButton } from "./MulliganButton";

interface Props {
  fullUsed: boolean;
  yearUsed: boolean;
  onMulliganFull: () => void;
  onMulliganYear: () => void;
}

export function MulliganBar({ fullUsed, yearUsed, onMulliganFull, onMulliganYear }: Props) {
  return (
    <div className="mulligan-bar">
      <p className="mulligan-label">Mulligan choices before you pick</p>
      <div className="mulligan-controls">
        <MulliganButton label="Reroll all 5" used={fullUsed} onClick={onMulliganFull} />
        <MulliganButton label="Reroll year" used={yearUsed} onClick={onMulliganYear} />
      </div>
    </div>
  );
}

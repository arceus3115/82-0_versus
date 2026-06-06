import { useState } from "react";
import type { DisplayCard } from "../game/types";
import { Statline } from "./Statline";

const SLOT_LABELS = ["PG", "SG", "SF", "PF", "C"];

interface Props {
  team: DisplayCard[];
  title?: string;
  hint?: string;
  interactive?: boolean;
  onSwap?: (fromIndex: number, toIndex: number) => void;
}

export function CourtRoster({ team, title, hint, interactive = false, onSwap }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const slots = Array.from({ length: 5 }, (_, i) => team[i] ?? null);

  const handleSlotClick = (index: number) => {
    if (!interactive || !slots[index]) return;

    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    onSwap?.(selected, index);
    setSelected(null);
  };

  return (
    <div className="court-roster">
      {title && <h4 className="court-roster__title">{title}</h4>}
      {(hint || interactive) && (
        <p className="court-roster__hint">{hint ?? "Tap two players to swap positions"}</p>
      )}
      <div className="court-roster__grid">
        {SLOT_LABELS.map((label, i) => {
          const filled = Boolean(slots[i]);
          const isSelected = selected === i;
          return (
            <div key={label} className={`court-slot court-slot--${label.toLowerCase()}`}>
              <span className="court-pos">{label}</span>
              {filled ? (
                <button
                  type="button"
                  className={`court-slot__card ${interactive ? "court-slot__card--interactive" : ""} ${isSelected ? "court-slot__card--selected" : ""}`}
                  disabled={!interactive}
                  onClick={() => handleSlotClick(i)}
                >
                  <Statline card={slots[i]!} compact />
                </button>
              ) : (
                <div className="court-slot__empty">Open</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

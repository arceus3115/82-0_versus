import type { InternalCard } from "./types";

export const SLOT_LABELS = ["PG", "SG", "SF", "PF", "C"] as const;
export type SlotLabel = (typeof SLOT_LABELS)[number];

const POSITION_INDEX: Record<SlotLabel, number> = {
  PG: 0,
  SG: 1,
  SF: 2,
  PF: 3,
  C: 4,
};

export interface StatMults {
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
}

export interface PositionFitResult {
  fitScore: number;
  statMults: StatMults;
  sigmaMult: number;
  tauBump: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function labelFit(positions: string[], slot: SlotLabel): number {
  if (positions.includes(slot)) return 1.0;

  const slotIdx = POSITION_INDEX[slot];
  let bestDist = 4;

  for (const pos of positions) {
    const idx = POSITION_INDEX[pos as SlotLabel];
    if (idx !== undefined) {
      bestDist = Math.min(bestDist, Math.abs(slotIdx - idx));
    }
  }

  if (positions.length === 0) return 0.84;
  if (bestDist === 1) return 0.93;
  if (bestDist === 2) return 0.84;
  return 0.65;
}

/** BPM-style continuous position estimate (1 = PG, 5 = C) from per-game stats. */
export function estimatePosition(card: InternalCard): number {
  const mpg = clamp(card.MP / 82, 10, 40);
  const astPctApprox = clamp((card.AST / mpg) * 100, 0, 50);
  const stlPctApprox = clamp((card.STL / mpg) * 100, 0, 10);
  const blkPctApprox = clamp((card.BLK / mpg) * 100, 0, 15);
  const drbPctApprox = clamp((card.TRB / mpg) * 60, 0, 35);

  const pos =
    5 -
    2.5 * (astPctApprox / 100) -
    0.25 * (stlPctApprox / 100) +
    3 * (blkPctApprox / 100) +
    0.5 * (drbPctApprox / 100);

  return clamp(pos, 1, 5);
}

function statMultsForMismatch(estimatedPos: number, slotPos: number, fitScore: number): StatMults {
  const mismatch = 1 - fitScore;
  const dist = Math.abs(estimatedPos - slotPos);

  let PTS = 1;
  let AST = 1;
  let TRB = 1;
  let STL = 1;
  let BLK = 1;

  const isGuard = estimatedPos <= 2.2;
  const isBig = estimatedPos >= 3.8;
  const slotIsGuard = slotPos <= 2;
  const slotIsBig = slotPos >= 4;

  if (isGuard && slotIsBig) {
    AST -= 0.2 * mismatch;
    STL -= 0.12 * mismatch;
    TRB += 0.05 * mismatch;
    BLK += 0.05 * mismatch;
  } else if (isBig && slotIsGuard) {
    BLK -= 0.28 * mismatch;
    TRB -= 0.18 * mismatch;
    AST -= 0.14 * mismatch;
    PTS -= 0.1 * mismatch;
  } else if (dist >= 1.5) {
    const penalty = 0.12 * mismatch;
    PTS -= penalty;
    AST -= penalty;
    TRB -= penalty * 0.8;
    STL -= penalty * 0.6;
    BLK -= penalty * 0.6;
  }

  return {
    PTS: clamp(PTS, 0.72, 1.05),
    AST: clamp(AST, 0.72, 1.05),
    TRB: clamp(TRB, 0.72, 1.08),
    STL: clamp(STL, 0.72, 1.05),
    BLK: clamp(BLK, 0.72, 1.08),
  };
}

export function computePositionFit(card: InternalCard, slot: SlotLabel): PositionFitResult {
  const lFit = labelFit(card.positions, slot);
  const estimatedPos = estimatePosition(card);
  const slotPos = POSITION_INDEX[slot] + 1;
  const profileFit = 1 - clamp(Math.abs(estimatedPos - slotPos) / 4, 0, 0.35);
  const fitScore = 0.55 * lFit + 0.45 * profileFit;

  const statMults = statMultsForMismatch(estimatedPos, slotPos, fitScore);
  const sigmaMult = 1 + 0.25 * (1 - fitScore);
  const tauBump = 0.02 * (1 - fitScore);

  return { fitScore, statMults, sigmaMult, tauBump };
}

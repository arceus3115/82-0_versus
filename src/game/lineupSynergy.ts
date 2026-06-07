import type { InternalCard } from "./types";
import { computePositionFit, SLOT_LABELS, type SlotLabel } from "./positionFit";

export interface SlottedCard {
  card: InternalCard;
  slot: SlotLabel;
  fitScore: number;
}

export interface LineupSynergyResult {
  offensiveMult: number;
  defensiveMult: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildSlottedLineup(team: InternalCard[]): SlottedCard[] {
  return team.map((card, i) => {
    const slot = SLOT_LABELS[i] ?? "SF";
    const fit = computePositionFit(card, slot);
    return { card, slot, fitScore: fit.fitScore };
  });
}

function isPlaymaker(card: InternalCard, cards: InternalCard[]): boolean {
  if (card.AST >= 5.5) return true;
  const topTwoAst = [...cards].sort((a, b) => b.AST - a.AST).slice(0, 2);
  return topTwoAst.includes(card) && card.AST >= 4;
}

function isScorer(card: InternalCard, cards: InternalCard[]): boolean {
  if (card.PTS >= 18) return true;
  const topTwoPts = [...cards].sort((a, b) => b.PTS - a.PTS).slice(0, 2);
  return topTwoPts.includes(card);
}

export function computeLineupSynergy(lineup: SlottedCard[]): LineupSynergyResult {
  const cards = lineup.map((entry) => entry.card);
  const avgFit = lineup.reduce((sum, entry) => sum + entry.fitScore, 0) / lineup.length;

  const playmakers = cards.filter((c) => isPlaymaker(c, cards));
  const scorers = cards.filter((c) => isScorer(c, cards));
  const finishers = scorers.filter((c) => !playmakers.includes(c) || playmakers.length > 1);

  let bonus = 0;

  if (playmakers.length >= 1 && finishers.length >= 2) bonus += 0.03;

  const rimProtectors = cards.filter((c) => c.BLK >= 1.2 || c.TRB >= 9);
  const redundantBigs = cards.filter((c) => c.TRB >= 10).length >= 2;
  if (rimProtectors.length >= 1 && !redundantBigs) bonus += 0.02;

  const highUsageScorers = cards.filter((c) => c.PTS >= 18);
  if (highUsageScorers.length >= 3 && playmakers.length === 0) bonus -= 0.04;

  if (!cards.some((c) => c.AST >= 4)) bonus -= 0.03;

  if (avgFit < 0.78) bonus -= 0.035;

  bonus = clamp(bonus, -0.08, 0.08);

  return {
    offensiveMult: 1 + bonus,
    defensiveMult: 1 + bonus * 0.5,
  };
}

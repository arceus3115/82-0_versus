import { SeededRNG } from "./rng";
import { toDisplayCard, toInternalCard } from "./model";
import type { DisplayCard, InternalCard, PlayerSeasonRaw } from "./types";

export const PICKS_PER_PLAYER = 5;
export const PICK_TIMER_MS = 15_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase();
}

/** Standard snake draft order. */
export function buildDraftOrder(playerIds: string[], picksPerPlayer: number): string[] {
  const order: string[] = [];
  for (let round = 0; round < picksPerPlayer; round++) {
    const ids = round % 2 === 0 ? [...playerIds] : [...playerIds].reverse();
    order.push(...ids);
  }
  return order;
}

export interface DraftedPool {
  ids: Set<string>;
  names: Set<string>;
}

export function getDraftedPool(
  teams: { team: InternalCard[] }[],
  exemptCardIds: Set<string> = new Set(),
): DraftedPool {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const { team } of teams) {
    for (const card of team) {
      if (exemptCardIds.has(card.id)) continue;
      ids.add(card.id);
      names.add(normalizePlayerName(card.player_name));
    }
  }
  return { ids, names };
}

function weightedSampleWithoutReplacement(
  cards: InternalCard[],
  count: number,
  weightFor: (card: InternalCard) => number,
  rng: SeededRNG,
): InternalCard[] {
  const pool = [...cards];
  const picked: InternalCard[] = [];

  while (picked.length < count && pool.length > 0) {
    const weights = pool.map(weightFor);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng.next() * total;
    let index = 0;

    for (; index < pool.length; index++) {
      roll -= weights[index];
      if (roll <= 0) break;
    }

    const chosen = pool.splice(Math.min(index, pool.length - 1), 1)[0];
    picked.push(chosen);
  }

  return picked;
}

export function generateCardOffer(
  pool: PlayerSeasonRaw[],
  drafted: DraftedPool,
  rng: SeededRNG,
  recentlyOffered: Set<string> = new Set(),
): InternalCard[] {
  const available = pool
    .filter((p) => !drafted.ids.has(p.id) && !drafted.names.has(normalizePlayerName(p.player_name)))
    .map(toInternalCard);

  if (available.length <= 5) {
    return rng.shuffle(available);
  }

  const weightFor = (card: InternalCard) => {
    const name = normalizePlayerName(card.player_name);
    let weight = 0.55 + rng.next() * 0.9;

    // Soft quality curve — stars appear, but not every offer.
    weight *= 0.35 + card.mu * 0.65;

    // Penalize names shown recently in this session.
    if (recentlyOffered.has(name)) weight *= 0.1;

    // Slight boost for volatile/risky cards to widen variety.
    if (card.tier === "Volatile") weight *= 1.15;
    if (card.tier === "Risky") weight *= 1.08;

    // Low-minute seasons stay in the pool but are rarely offered.
    if (card.MP < 800) weight *= 0.06;
    else if (card.MP < 1200) weight *= 0.2;
    else if (card.MP < 1800) weight *= 0.5;
    else if (card.MP < 2200) weight *= 0.78;

    return weight;
  };

  return rng.shuffle(weightedSampleWithoutReplacement(available, 5, weightFor, rng));
}

export function toDisplayOffer(cards: InternalCard[]): DisplayCard[] {
  return cards.map(toDisplayCard);
}

export function findAlternateSeason(
  pool: PlayerSeasonRaw[],
  playerName: string,
  excludeIds: Set<string>,
  rng: SeededRNG,
): InternalCard | null {
  const options = pool
    .filter(
      (p) =>
        normalizePlayerName(p.player_name) === normalizePlayerName(playerName) &&
        !excludeIds.has(p.id),
    )
    .map(toInternalCard);
  if (options.length === 0) return null;
  return options[rng.nextInt(options.length)];
}

/** Drafted players plus other cards currently on the table (offer). */
export function getOfferExclusions(
  drafted: DraftedPool,
  offer: InternalCard[],
  exceptId?: string,
): DraftedPool {
  const ids = new Set(drafted.ids);
  const names = new Set(drafted.names);
  for (const card of offer) {
    if (card.id === exceptId) continue;
    ids.add(card.id);
    names.add(normalizePlayerName(card.player_name));
  }
  return { ids, names };
}

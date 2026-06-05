import { SeededRNG } from "./rng";
import { toDisplayCard, toInternalCard } from "./model";
import type { DisplayCard, InternalCard, PlayerSeasonRaw } from "./types";

export const PICKS_PER_PLAYER = 5;
export const PICK_TIMER_MS = 15_000;
export const MIN_LOBBY_PLAYERS = 2;
export const MAX_LOBBY_PLAYERS = 12;

export function buildSnakeOrder(playerIds: string[], picksPerPlayer: number): string[] {
  const order: string[] = [];
  for (let round = 0; round < picksPerPlayer; round++) {
    const ids = round % 2 === 0 ? [...playerIds] : [...playerIds].reverse();
    order.push(...ids);
  }
  return order;
}

function tierBucket(card: InternalCard): "high" | "mid" | "low" {
  if (card.mu >= 0.62) return "high";
  if (card.mu <= 0.52 || card.tau >= 0.08 || card.sigma >= 0.06) return "low";
  return "mid";
}

export function generateCardOffer(
  pool: PlayerSeasonRaw[],
  draftedIds: Set<string>,
  rng: SeededRNG,
): InternalCard[] {
  const available = pool
    .filter((p) => !draftedIds.has(p.id))
    .map(toInternalCard);

  const high = available.filter((c) => tierBucket(c) === "high");
  const mid = available.filter((c) => tierBucket(c) === "mid");
  const low = available.filter((c) => tierBucket(c) === "low");

  const pickOne = (list: InternalCard[], fallback: InternalCard[]) => {
    const source = list.length > 0 ? list : fallback;
    return source[rng.nextInt(source.length)];
  };

  const used = new Set<string>();
  const take = (card: InternalCard) => {
    if (used.has(card.id)) {
      const alt = available.find((c) => !used.has(c.id));
      if (!alt) return card;
      used.add(alt.id);
      return alt;
    }
    used.add(card.id);
    return card;
  };

  const cards = [
    take(pickOne(high, available)),
    take(pickOne(mid, available)),
    take(pickOne(mid, available)),
    take(pickOne(low, available)),
    take(pickOne(low, available)),
  ];

  return rng.shuffle(cards);
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
  const options = pool.filter(
    (p) => p.player_name === playerName && !excludeIds.has(p.id),
  );
  if (options.length === 0) return null;
  return toInternalCard(options[rng.nextInt(options.length)]);
}

export function generateFullRoster(
  pool: PlayerSeasonRaw[],
  draftedIds: Set<string>,
  rng: SeededRNG,
): InternalCard[] {
  const roster: InternalCard[] = [];
  const localDrafted = new Set(draftedIds);
  for (let i = 0; i < PICKS_PER_PLAYER; i++) {
    const offer = generateCardOffer(pool, localDrafted, rng);
    const pick = offer[rng.nextInt(offer.length)];
    roster.push(pick);
    localDrafted.add(pick.id);
  }
  return roster;
}

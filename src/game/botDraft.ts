import { normalizePlayerName, type DraftedPool } from "./draft";
import type { SeededRNG } from "./rng";
import type { BotPersonality, InternalCard } from "./types";

function validOfferCards(offer: InternalCard[], drafted: DraftedPool): InternalCard[] {
  return offer.filter(
    (card) =>
      !drafted.ids.has(card.id) && !drafted.names.has(normalizePlayerName(card.player_name)),
  );
}

function valueScore(card: InternalCard): number {
  return card.mu - card.sigma * 0.5 + (card.MP / 3000) * 0.1;
}

export function pickBotCard(
  offer: InternalCard[],
  personality: BotPersonality,
  drafted: DraftedPool,
  rng: SeededRNG,
): InternalCard | null {
  const valid = validOfferCards(offer, drafted);
  if (valid.length === 0) return null;

  switch (personality) {
    case "greedy":
      return valid.reduce((best, card) => (card.mu > best.mu ? card : best));
    case "stars":
      return valid.reduce((best, card) => (card.PTS > best.PTS ? card : best));
    case "value":
      return valid.reduce((best, card) => (valueScore(card) > valueScore(best) ? card : best));
    case "random":
      return valid[rng.nextInt(valid.length)];
  }
}

export const BOT_PERSONALITIES: BotPersonality[] = ["greedy", "stars", "value", "random"];

export function randomBotPersonality(rng: SeededRNG): BotPersonality {
  return BOT_PERSONALITIES[rng.nextInt(BOT_PERSONALITIES.length)];
}

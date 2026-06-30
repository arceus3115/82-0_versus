import type { SeededRNG } from "./rng";

const BOT_NAMES = [
  "Bricklayer",
  "Reach Pick",
  "Stat Stuffer",
  "Floor Spacer",
  "High Usage",
  "Trade Machine",
  "Second Rounder",
  "Max Contract",
  "Tank Commander",
  "Heat Check",
  "Glue Guy",
  "Lottery Luck",
  "Buyout Season",
  "Two-Way Deal",
  "Stretch Four",
  "Paint Beast",
  "Corner Three",
  "Fast Break",
  "Bench Mob",
  "Franchise Tag",
];

export function pickBotNames(rng: SeededRNG, count: number): string[] {
  const pool = rng.shuffle([...BOT_NAMES]);
  return pool.slice(0, count);
}

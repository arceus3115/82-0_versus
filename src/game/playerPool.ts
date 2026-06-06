import type { PlayerSeasonRaw } from "./types";

let cached: PlayerSeasonRaw[] | null = null;

/** Fetches pre-built player pool shipped with the static site (works on GitHub Pages). */
export async function loadPlayerPool(): Promise<PlayerSeasonRaw[]> {
  if (cached) return cached;

  const url = `${import.meta.env.BASE_URL}data/players.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not load player data (${response.status}). Rebuild with npm run data:build`,
    );
  }

  cached = (await response.json()) as PlayerSeasonRaw[];
  return cached;
}

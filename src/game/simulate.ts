import { SeededRNG } from "./rng";
import type { LobbyPlayer, RoundOutcome } from "./types";

export const COLLAPSE_LAMBDA = 0.3;
export const FIXED_SEASON_ROUNDS = 18;

const WIN_FLAVORS = [
  "clutch stop",
  "dominant win",
  "survived the run",
  "closed it out",
  "gritty road win",
];

const LOSS_FLAVORS = [
  "late turnover",
  "cold shooting night",
  "collapse in the fourth",
  "foul trouble spiral",
  "bench got cooked",
];

const COLLAPSE_FLAVORS = [
  "total meltdown",
  "back-to-back turnovers",
  "defense vanished",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function simulateRound(
  player: LobbyPlayer,
  round: number,
  rng: SeededRNG,
  collapseLambda: number,
): RoundOutcome {
  const epsilon = rng.normal() * player.sigmaTeam;
  const collapse = rng.next() < player.tauTeam;
  const pWin = clamp(
    player.muTeam + epsilon - collapseLambda * (collapse ? 1 : 0),
    0.3,
    0.85,
  );
  const won = rng.next() < pWin;

  let flavor: string;
  if (collapse && !won) {
    flavor = COLLAPSE_FLAVORS[rng.nextInt(COLLAPSE_FLAVORS.length)];
  } else if (won) {
    flavor = WIN_FLAVORS[rng.nextInt(WIN_FLAVORS.length)];
  } else {
    flavor = LOSS_FLAVORS[rng.nextInt(LOSS_FLAVORS.length)];
  }

  return {
    playerId: player.id,
    round,
    won,
    flavor,
    collapse,
    pWin,
  };
}

export function applyOutcome(
  player: LobbyPlayer,
  outcome: RoundOutcome,
  mode: "elimination" | "fixed_season",
): LobbyPlayer {
  const next = { ...player };
  if (outcome.won) {
    next.streak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
  } else if (mode === "elimination") {
    next.eliminated = true;
    next.streak = 0;
  } else {
    next.streak = 0;
  }
  return next;
}

export function pickWinner(players: LobbyPlayer[], mode: "elimination" | "fixed_season") {
  if (mode === "elimination") {
    const alive = players.filter((p) => !p.eliminated);
    if (alive.length === 1) return alive[0].id;
    const byStreak = [...players].sort((a, b) => b.streak - a.streak);
    return byStreak[0]?.id ?? null;
  }
  const byMax = [...players].sort((a, b) => b.maxStreak - a.maxStreak);
  return byMax[0]?.id ?? null;
}

export function rarityPercentile(maxStreak: number): string {
  if (maxStreak >= 16) return "top 0.5% run";
  if (maxStreak >= 12) return "top 2% run";
  if (maxStreak >= 8) return "top 10% run";
  if (maxStreak >= 5) return "top 25% run";
  return "solid run";
}

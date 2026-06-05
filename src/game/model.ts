import type {
  InternalCard,
  PlayerSeasonRaw,
  VolatilityTier,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeMu(bpm: number): number {
  return clamp(0.5 + bpm * 0.015, 0.42, 0.72);
}

export function computeSigma(mp: number): number {
  return clamp(0.025 + 0.05 * (1 - mp / 3000), 0.02, 0.08);
}

export function computeTau(tovPct: number, tsPct: number): number {
  const turnoverRate = tovPct / 100;
  const ts = tsPct / 100;
  return clamp(0.02 + 0.06 * turnoverRate - 0.04 * ts, 0.01, 0.12);
}

export function computeTier(sigma: number, tau: number): VolatilityTier {
  if (tau >= 0.08) return "Risky";
  if (sigma >= 0.055) return "Volatile";
  return "Stable";
}

export function toInternalCard(raw: PlayerSeasonRaw): InternalCard {
  const mu = computeMu(raw.BPM);
  const sigma = computeSigma(raw.MP);
  const tau = computeTau(raw.TOV_pct, raw.TS_pct);
  return {
    id: raw.id,
    player_name: raw.player_name,
    season: raw.season,
    PTS: raw.PTS,
    AST: raw.AST,
    TRB: raw.TRB,
    STL: raw.STL,
    BLK: raw.BLK,
    tier: computeTier(sigma, tau),
    mu,
    sigma,
    tau,
  };
}

export function toDisplayCard(card: InternalCard) {
  return {
    id: card.id,
    player_name: card.player_name,
    season: card.season,
    PTS: card.PTS,
    AST: card.AST,
    TRB: card.TRB,
    STL: card.STL,
    BLK: card.BLK,
    tier: card.tier,
  };
}

export function aggregateTeam(team: InternalCard[]) {
  if (team.length === 0) {
    return { muTeam: 0.5, sigmaTeam: 0.04, tauTeam: 0.05 };
  }
  const muTeam = team.reduce((sum, c) => sum + c.mu, 0) / team.length;
  const sigmaTeam = team.reduce((sum, c) => sum + c.sigma, 0) / team.length;
  const tauTeam = 1 - team.reduce((product, c) => product * (1 - c.tau), 1);
  return { muTeam, sigmaTeam, tauTeam };
}

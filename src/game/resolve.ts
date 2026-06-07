import { buildSlottedLineup, computeLineupSynergy } from "./lineupSynergy";
import { computePositionFit, SLOT_LABELS } from "./positionFit";
import type { SeededRNG } from "./rng";
import { computeMatchupFactors, computeTeamRatings, type TeamRatings } from "./teamRatings";
import type {
  InternalCard,
  LobbyPlayer,
  MatchResult,
  PlayerTemperatureLog,
  PredictedStatline,
  TeamSimulationDetail,
} from "./types";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Game-to-game coefficients of variation tuned to NBA single-game logs. */
const STAT_CV = {
  PTS: 0.4,
  AST: 0.46,
  TRB: 0.38,
  STL: 0.62,
  BLK: 0.68,
} as const;

type StatKey = keyof typeof STAT_CV;
type GameTemp = "hot" | "cold" | "normal";

interface PlayerGameState {
  temp: GameTemp;
  label: string;
  offensiveMult: number;
  defensiveMult: number;
}

function displayLabel(temp: GameTemp, raw: string | null): string {
  if (raw) return raw;
  if (temp === "hot") return "hot";
  if (temp === "cold") return "cold";
  return "normal";
}

function rollPlayerGameState(card: InternalCard, rng: SeededRNG, tauBump = 0): PlayerGameState {
  const hotChance = 0.065 + card.mu * 0.055;
  const coldChance = clamp(0.055 + card.tau * 0.5 + tauBump, 0, 0.35);
  const roll = rng.next();

  if (roll < hotChance) {
    const mult = 1.22 + rng.next() * 0.38;
    return {
      temp: "hot",
      label: displayLabel("hot", null),
      offensiveMult: mult,
      defensiveMult: 0.92 + rng.next() * 0.18,
    };
  }

  if (roll < hotChance + coldChance) {
    const mult = 0.48 + rng.next() * 0.26;
    return {
      temp: "cold",
      label: displayLabel("cold", null),
      offensiveMult: mult,
      defensiveMult: 0.55 + rng.next() * 0.25,
    };
  }

  if (rng.next() < 0.028) {
    const mult = 1.55 + rng.next() * 0.45;
    return {
      temp: "hot",
      label: "career night",
      offensiveMult: mult,
      defensiveMult: 1.05 + rng.next() * 0.2,
    };
  }

  if (rng.next() < 0.025) {
    const mult = 0.18 + rng.next() * 0.18;
    return {
      temp: "cold",
      label: "dud",
      offensiveMult: mult,
      defensiveMult: 0.35 + rng.next() * 0.2,
    };
  }

  const mult = 0.88 + rng.next() * 0.28;
  return {
    temp: "normal",
    label: "normal",
    offensiveMult: mult,
    defensiveMult: 0.85 + rng.next() * 0.3,
  };
}

function gameStdDev(mean: number, cv: number, mp: number, sigmaMult = 1): number {
  const reliability = Math.sqrt(clamp(mp, 400, 3200) / 2000);
  return mean * cv * (1.05 / reliability) * sigmaMult;
}

function correlatedMult(
  gameState: PlayerGameState,
  kind: "offense" | "defense" | "rebound",
): number {
  if (kind === "offense") return gameState.offensiveMult;
  if (kind === "defense") return gameState.defensiveMult;
  return gameState.offensiveMult * 0.42 + 0.58;
}

function sampleStat(
  mean: number,
  card: InternalCard,
  stat: StatKey,
  mult: number,
  rng: SeededRNG,
  sigmaMult = 1,
): number {
  let spike = 1;
  if (rng.next() < 0.04 + card.sigma * 0.5) {
    spike = rng.next() < 0.5 ? 0.4 + rng.next() * 0.35 : 1.25 + rng.next() * 0.55;
  }

  const std = gameStdDev(mean, STAT_CV[stat], card.MP, sigmaMult);
  const draw = mean * mult * spike + rng.normal() * std;
  return Math.max(0, draw);
}

interface TeamSimulation {
  statline: PredictedStatline;
  rawPTS: number;
  totalPTS: number;
  playerLogs: PlayerTemperatureLog[];
  ratings: TeamRatings;
}

function simulateTeam(player: LobbyPlayer, rng: SeededRNG): TeamSimulation {
  const lineup = buildSlottedLineup(player.team);
  const synergy = computeLineupSynergy(lineup);
  const ratings = computeTeamRatings(lineup, synergy.offensiveMult);

  let pts = 0;
  let ast = 0;
  let trb = 0;
  let stl = 0;
  let blk = 0;
  const playerLogs: PlayerTemperatureLog[] = [];

  for (let i = 0; i < lineup.length; i++) {
    const { card } = lineup[i];
    const slot = SLOT_LABELS[i] ?? "SF";
    const fit = computePositionFit(card, slot);

    const gameState = rollPlayerGameState(card, rng, fit.tauBump);
    const offMult = correlatedMult(gameState, "offense");
    const rebMult = correlatedMult(gameState, "rebound");
    const defMult = correlatedMult(gameState, "defense");

    pts += sampleStat(
      card.PTS * fit.statMults.PTS * synergy.offensiveMult,
      card,
      "PTS",
      offMult,
      rng,
      fit.sigmaMult,
    );
    ast += sampleStat(
      card.AST * fit.statMults.AST * synergy.offensiveMult,
      card,
      "AST",
      offMult * 0.96,
      rng,
      fit.sigmaMult,
    );
    trb += sampleStat(card.TRB * fit.statMults.TRB, card, "TRB", rebMult, rng, fit.sigmaMult);
    stl += sampleStat(
      card.STL * fit.statMults.STL * synergy.defensiveMult,
      card,
      "STL",
      defMult,
      rng,
      fit.sigmaMult,
    );
    blk += sampleStat(
      card.BLK * fit.statMults.BLK * synergy.defensiveMult,
      card,
      "BLK",
      defMult,
      rng,
      fit.sigmaMult,
    );

    playerLogs.push({
      teamPlayerId: player.id,
      teamName: player.name,
      player_name: card.player_name,
      label: gameState.label,
    });
  }

  const statline: PredictedStatline = {
    playerId: player.id,
    playerName: player.name,
    PTS: round1(pts),
    AST: round1(ast),
    TRB: round1(trb),
    STL: round1(stl),
    BLK: round1(blk),
  };

  return { statline, rawPTS: statline.PTS, totalPTS: statline.PTS, playerLogs, ratings };
}

export function resolveMatch(players: LobbyPlayer[], rng: SeededRNG): MatchResult {
  const simulations = players.map((player) => simulateTeam(player, rng));

  if (simulations.length === 2) {
    const { factorA, factorB } = computeMatchupFactors(
      simulations[0].ratings,
      simulations[1].ratings,
    );

    simulations[0].statline.PTS = round1(simulations[0].rawPTS * factorA);
    simulations[0].totalPTS = simulations[0].statline.PTS;

    simulations[1].statline.PTS = round1(simulations[1].rawPTS * factorB);
    simulations[1].totalPTS = simulations[1].statline.PTS;
  }

  const scores = simulations
    .map((sim) => ({
      playerId: sim.statline.playerId,
      playerName: sim.statline.playerName,
      rating: sim.totalPTS,
      netRating: sim.totalPTS,
      offensiveRating: sim.statline.PTS,
      defensiveRating: round1(sim.statline.STL + sim.statline.BLK),
    }))
    .sort((a, b) => b.rating - a.rating);

  const topPTS = scores[0]?.rating ?? 0;
  const isTie = scores.length > 1 && scores[1].rating === topPTS;
  const winnerId = isTie ? null : (scores[0]?.playerId ?? null);

  const simulationDetails: TeamSimulationDetail[] = simulations.map((sim) => ({
    playerId: sim.statline.playerId,
    teamName: sim.statline.playerName,
    playerLogs: sim.playerLogs,
  }));

  const temperatureLog = simulations.flatMap((sim) => sim.playerLogs);

  return {
    winnerId,
    isTie,
    predictedStatlines: simulations.map((sim) => sim.statline),
    scores,
    simulationDetails,
    temperatureLog,
  };
}

/**
 * Offline calibration harness for the hybrid simulation engine.
 * Run: npx tsx scripts/calibrate-sim.ts
 */
import { toInternalCard } from "../src/game/model";
import { resolveMatch } from "../src/game/resolve";
import { SeededRNG } from "../src/game/rng";
import type { InternalCard, LobbyPlayer } from "../src/game/types";

function makeCard(
  overrides: Partial<InternalCard> & Pick<InternalCard, "id" | "player_name">,
): InternalCard {
  return toInternalCard({
    id: overrides.id,
    player_name: overrides.player_name,
    season: "2023-24",
    team_ticker: "LAL",
    positions: overrides.positions ?? ["SF"],
    PTS: overrides.PTS ?? 15,
    AST: overrides.AST ?? 3,
    TRB: overrides.TRB ?? 5,
    STL: overrides.STL ?? 1,
    BLK: overrides.BLK ?? 0.5,
    MP: overrides.MP ?? 2400,
    BPM: overrides.BPM ?? 2,
    TS_pct: overrides.TS_pct ?? 56,
    TOV_pct: overrides.TOV_pct ?? 12,
  });
}

function makeLobby(id: string, team: InternalCard[]): LobbyPlayer {
  return {
    id,
    name: id,
    ready: true,
    confirmed: true,
    isHost: false,
    team,
    muTeam: 0.5,
    sigmaTeam: 0.04,
    tauTeam: 0.05,
    mulligan: { fullUsed: false, yearUsed: false },
  };
}

const balancedTeam: InternalCard[] = [
  makeCard({
    id: "1",
    player_name: "PG",
    positions: ["PG"],
    PTS: 22,
    AST: 8,
    TRB: 4,
    STL: 1.4,
    BLK: 0.3,
    BPM: 4,
  }),
  makeCard({
    id: "2",
    player_name: "SG",
    positions: ["SG"],
    PTS: 20,
    AST: 4,
    TRB: 4,
    STL: 1.2,
    BLK: 0.4,
    BPM: 3,
  }),
  makeCard({
    id: "3",
    player_name: "SF",
    positions: ["SF"],
    PTS: 18,
    AST: 3.5,
    TRB: 6,
    STL: 1.1,
    BLK: 0.6,
    BPM: 2.5,
  }),
  makeCard({
    id: "4",
    player_name: "PF",
    positions: ["PF"],
    PTS: 16,
    AST: 2.5,
    TRB: 8,
    STL: 0.9,
    BLK: 1.0,
    BPM: 2,
  }),
  makeCard({
    id: "5",
    player_name: "C",
    positions: ["C"],
    PTS: 14,
    AST: 2,
    TRB: 11,
    STL: 0.7,
    BLK: 2.2,
    BPM: 1.5,
  }),
];

const misalignedTeam: InternalCard[] = [
  balancedTeam[4], // C at PG
  balancedTeam[3], // PF at SG
  balancedTeam[2],
  balancedTeam[1],
  balancedTeam[0], // PG at C
];

function runSims(teamA: InternalCard[], teamB: InternalCard[], count: number, seed: number) {
  let winsA = 0;
  const ptsSamples: number[] = [];

  for (let i = 0; i < count; i++) {
    const rng = new SeededRNG(seed + i);
    const result = resolveMatch([makeLobby("A", teamA), makeLobby("B", teamB)], rng);
    if (result.winnerId === "A") winsA++;
    ptsSamples.push(result.predictedStatlines[0]?.PTS ?? 0);
  }

  const mean = ptsSamples.reduce((s, v) => s + v, 0) / ptsSamples.length;
  const variance = ptsSamples.reduce((s, v) => s + (v - mean) ** 2, 0) / ptsSamples.length;
  const stdDev = Math.sqrt(variance);

  return { winsA, winRateA: winsA / count, meanPTS: mean, stdDevPTS: stdDev };
}

function swapEnds(team: InternalCard[]): InternalCard[] {
  return [team[4], team[3], team[2], team[1], team[0]];
}

console.log("=== Versus hybrid sim calibration ===\n");

const balancedVsMisaligned = runSims(balancedTeam, misalignedTeam, 2000, 42);
console.log("Balanced vs misaligned (2000 sims):");
console.log(`  Balanced win rate: ${(balancedVsMisaligned.winRateA * 100).toFixed(1)}%`);
console.log(
  `  Balanced mean PTS: ${balancedVsMisaligned.meanPTS.toFixed(1)} ± ${balancedVsMisaligned.stdDevPTS.toFixed(1)}`,
);

const seedVariance = runSims(balancedTeam, balancedTeam, 500, 1000);
console.log("\nSame balanced lineup, different seeds (500 sims, vs self):");
console.log(
  `  Mean PTS: ${seedVariance.meanPTS.toFixed(1)} ± ${seedVariance.stdDevPTS.toFixed(1)}`,
);

const naturalOrder = runSims(balancedTeam, balancedTeam, 1000, 5000);
const swappedOrder = runSims(swapEnds(balancedTeam), balancedTeam, 1000, 5000);
console.log("\nPermutation check (1000 sims each vs same opponent):");
console.log(`  Natural slot order mean PTS: ${naturalOrder.meanPTS.toFixed(1)}`);
console.log(`  Reversed slot order mean PTS: ${swappedOrder.meanPTS.toFixed(1)}`);
console.log(`  Delta: ${(naturalOrder.meanPTS - swappedOrder.meanPTS).toFixed(1)}`);

const winRateOk = balancedVsMisaligned.winRateA >= 0.55 && balancedVsMisaligned.winRateA <= 0.75;
const varianceOk = balancedVsMisaligned.stdDevPTS >= 15;
const permutationOk = Math.abs(naturalOrder.meanPTS - swappedOrder.meanPTS) >= 1;

console.log("\nChecks:");
console.log(
  `  Win rate in 55–75% band: ${winRateOk ? "PASS" : "FAIL"} (${(balancedVsMisaligned.winRateA * 100).toFixed(1)}%)`,
);
console.log(
  `  PTS std dev substantial: ${varianceOk ? "PASS" : "FAIL"} (${balancedVsMisaligned.stdDevPTS.toFixed(1)})`,
);
console.log(
  `  Slot order shifts mean PTS: ${permutationOk ? "PASS" : "FAIL"} (Δ=${Math.abs(naturalOrder.meanPTS - swappedOrder.meanPTS).toFixed(1)})`,
);

if (!winRateOk || !varianceOk || !permutationOk) {
  process.exitCode = 1;
}

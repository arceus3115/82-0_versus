import type { SeededRNG } from "./rng";
import type { BracketMatch, BracketMatchStatus, TournamentState } from "./types";

export function nextPowerOf2(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Seed numbers (1-indexed) top-to-bottom in bracket slots for size 2^k. */
function bracketSeedOrder(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];
  const half = bracketSeedOrder(bracketSize / 2);
  const order: number[] = [];
  for (const seed of half) {
    order.push(seed);
    order.push(bracketSize + 1 - seed);
  }
  return order;
}

function makeMatchId(round: number, slot: number): string {
  return `r${round}-s${slot}`;
}

function seedRank(seeds: string[], playerId: string | null): number {
  if (!playerId) return Number.MAX_SAFE_INTEGER;
  const idx = seeds.indexOf(playerId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export function buildBracket(seeds: string[], rng: SeededRNG): TournamentState {
  const shuffled = rng.shuffle([...seeds]);
  const n = shuffled.length;
  const bracketSize = nextPowerOf2(n);
  const rounds = Math.log2(bracketSize);
  const seedOrder = bracketSeedOrder(bracketSize);

  const round0Slots: (string | null)[] = new Array(bracketSize).fill(null);
  for (let pos = 0; pos < bracketSize; pos++) {
    const seedNum = seedOrder[pos];
    if (seedNum <= n) {
      round0Slots[pos] = shuffled[seedNum - 1];
    }
  }

  const matches: BracketMatch[] = [];

  for (let round = 0; round < rounds; round++) {
    const matchesInRound = bracketSize / 2 ** (round + 1);
    for (let slot = 0; slot < matchesInRound; slot++) {
      let playerAId: string | null = null;
      let playerBId: string | null = null;
      let status: BracketMatchStatus = "pending";

      if (round === 0) {
        playerAId = round0Slots[slot * 2] ?? null;
        playerBId = round0Slots[slot * 2 + 1] ?? null;

        if (playerAId && !playerBId) {
          status = "bye";
        } else if (!playerAId && playerBId) {
          status = "bye";
          [playerAId, playerBId] = [playerBId, null];
        } else if (playerAId && playerBId) {
          status = "ready";
        }
      }

      matches.push({
        id: makeMatchId(round, slot),
        round,
        slot,
        playerAId,
        playerBId,
        winnerId: status === "bye" ? playerAId : null,
        status,
        result: null,
      });
    }
  }

  const tournament: TournamentState = {
    seeds: shuffled,
    matches,
    currentMatchId: null,
    championId: null,
  };

  applyByeAdvancement(tournament);
  return tournament;
}

function parentMatch(tournament: TournamentState, match: BracketMatch): BracketMatch | null {
  const nextRound = match.round + 1;
  const parentSlot = Math.floor(match.slot / 2);
  return tournament.matches.find((m) => m.round === nextRound && m.slot === parentSlot) ?? null;
}

export function applyByeAdvancement(tournament: TournamentState): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of tournament.matches) {
      if (match.status !== "bye" || !match.winnerId) continue;

      const parent = parentMatch(tournament, match);
      if (!parent) {
        tournament.championId = match.winnerId;
        continue;
      }

      const isTopSlot = match.slot % 2 === 0;
      if (isTopSlot) {
        if (parent.playerAId !== match.winnerId) {
          parent.playerAId = match.winnerId;
          changed = true;
        }
      } else if (parent.playerBId !== match.winnerId) {
        parent.playerBId = match.winnerId;
        changed = true;
      }

      refreshMatchStatus(parent);
    }
  }

  refreshCurrentMatch(tournament);
}

function refreshMatchStatus(match: BracketMatch): void {
  if (match.status === "complete") return;

  if (match.playerAId && match.playerBId) {
    match.status = "ready";
    match.winnerId = null;
    return;
  }

  if (match.playerAId || match.playerBId) {
    // Round-0 byes are assigned at bracket build and keep status "bye".
    if (match.status === "bye" && match.round === 0) return;
    match.status = "pending";
    match.winnerId = null;
    return;
  }

  match.status = "pending";
  match.winnerId = null;
}

export function getMatch(tournament: TournamentState, matchId: string): BracketMatch | undefined {
  return tournament.matches.find((m) => m.id === matchId);
}

export function getNextResolvableMatch(tournament: TournamentState): BracketMatch | null {
  const rounds = Math.max(...tournament.matches.map((m) => m.round)) + 1;
  for (let round = 0; round < rounds; round++) {
    const roundMatches = tournament.matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.slot - b.slot);
    for (const match of roundMatches) {
      if (match.status === "ready") return match;
      if (match.status === "bye" && match.winnerId) continue;
    }
  }
  return null;
}

export function advanceWinner(
  tournament: TournamentState,
  matchId: string,
  winnerId: string,
): void {
  const match = getMatch(tournament, matchId);
  if (!match) return;

  match.winnerId = winnerId;
  match.status = "complete";

  const parent = parentMatch(tournament, match);
  if (!parent) {
    tournament.championId = winnerId;
    tournament.currentMatchId = null;
    return;
  }

  const isTopSlot = match.slot % 2 === 0;
  if (isTopSlot) parent.playerAId = winnerId;
  else parent.playerBId = winnerId;

  refreshMatchStatus(parent);
  refreshCurrentMatch(tournament);
}

function refreshCurrentMatch(tournament: TournamentState): void {
  if (tournament.championId) {
    tournament.currentMatchId = null;
    return;
  }
  const next = getNextResolvableMatch(tournament);
  tournament.currentMatchId = next?.id ?? null;
}

export function higherSeedWins(seeds: string[], playerAId: string, playerBId: string): string {
  const rankA = seedRank(seeds, playerAId);
  const rankB = seedRank(seeds, playerBId);
  return rankA <= rankB ? playerAId : playerBId;
}

export function getRoundLabel(roundIdx: number, totalRounds: number): string {
  if (totalRounds <= 1) return "Final";
  if (roundIdx === totalRounds - 1) return "Final";
  if (roundIdx === totalRounds - 2) return "Semifinals";
  if (roundIdx === totalRounds - 3) return "Quarterfinals";
  return `Round ${roundIdx + 1}`;
}

export function getMatchesByRound(tournament: TournamentState): BracketMatch[][] {
  const rounds = Math.max(...tournament.matches.map((m) => m.round)) + 1;
  const grouped: BracketMatch[][] = [];
  for (let round = 0; round < rounds; round++) {
    grouped.push(
      tournament.matches.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot),
    );
  }
  return grouped;
}

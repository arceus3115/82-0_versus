export type GamePhase =
  | "waiting"
  | "drafting"
  | "mulligan"
  | "simulating"
  | "finished";

export type GameMode = "elimination" | "fixed_season";

export type VolatilityTier = "Stable" | "Volatile" | "Risky";

export interface PlayerSeasonRaw {
  id: string;
  player_name: string;
  season: string;
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
  MP: number;
  BPM: number;
  TS_pct: number;
  TOV_pct: number;
}

export interface InternalCard {
  id: string;
  player_name: string;
  season: string;
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
  tier: VolatilityTier;
  mu: number;
  sigma: number;
  tau: number;
}

export interface DisplayCard {
  id: string;
  player_name: string;
  season: string;
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
  tier: VolatilityTier;
}

export interface MulliganState {
  fullUsed: boolean;
  yearUsed: boolean;
  fullAvailable: boolean;
  yearAvailable: boolean;
  done: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
  team: InternalCard[];
  muTeam: number;
  sigmaTeam: number;
  tauTeam: number;
  streak: number;
  maxStreak: number;
  eliminated: boolean;
  mulligan: MulliganState;
}

export interface RoundOutcome {
  playerId: string;
  round: number;
  won: boolean;
  flavor: string;
  collapse: boolean;
  pWin: number;
}

export interface LobbyState {
  code: string;
  phase: GamePhase;
  mode: GameMode;
  rngSeed: number;
  hostId: string;
  players: LobbyPlayer[];
  draftOrder: string[];
  currentPickIndex: number;
  offeredCards: DisplayCard[];
  pickDeadline: number | null;
  totalDraftPicks: number;
  simulationRound: number;
  maxRounds: number;
  collapseLambda: number;
  lastOutcomes: RoundOutcome[];
  winnerId: string | null;
  feed: string[];
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "ready" }
  | { type: "start"; mode: GameMode; minPlayers?: number }
  | { type: "pick"; cardId: string }
  | { type: "mulligan_full" }
  | { type: "mulligan_year"; playerName: string }
  | { type: "mulligan_skip" }
  | { type: "simulate_round" };

export type HostMessage =
  | { type: "state"; state: LobbyState }
  | { type: "error"; message: string }
  | { type: "assigned"; playerId: string; isHost: boolean };

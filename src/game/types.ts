export type GamePhase = "waiting" | "drafting" | "confirming" | "finished";

export type VolatilityTier = "Stable" | "Volatile" | "Risky";

export interface PlayerSeasonRaw {
  id: string;
  player_name: string;
  season: string;
  team_ticker: string;
  positions: string[];
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
  team_ticker: string;
  positions: string[];
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
  MP: number;
  BPM: number;
  TS_pct: number;
  TOV_pct: number;
  tier: VolatilityTier;
  mu: number;
  sigma: number;
  tau: number;
}

export interface DisplayCard {
  id: string;
  player_name: string;
  season: string;
  team_ticker: string;
  positions: string[];
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
}

export interface MulliganState {
  fullUsed: boolean;
  yearUsed: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  confirmed: boolean;
  isHost: boolean;
  team: InternalCard[];
  muTeam: number;
  sigmaTeam: number;
  tauTeam: number;
  mulligan: MulliganState;
}

export interface DraftPickRecord {
  pickNumber: number;
  drafterId: string;
  drafterName: string;
  card: DisplayCard;
}

export interface PredictedStatline {
  playerId: string;
  playerName: string;
  PTS: number;
  AST: number;
  TRB: number;
  STL: number;
  BLK: number;
}

export interface PlayerTemperatureLog {
  teamPlayerId: string;
  teamName: string;
  player_name: string;
  label: string;
}

export interface TeamSimulationDetail {
  playerId: string;
  teamName: string;
  playerLogs: PlayerTemperatureLog[];
}

export interface MatchResult {
  winnerId: string | null;
  isTie: boolean;
  predictedStatlines: PredictedStatline[];
  scores: {
    playerId: string;
    playerName: string;
    rating: number;
    netRating: number;
    offensiveRating: number;
    defensiveRating: number;
  }[];
  simulationDetails: TeamSimulationDetail[];
  temperatureLog: PlayerTemperatureLog[];
}

export interface LobbyState {
  code: string;
  phase: GamePhase;
  rngSeed: number;
  hostId: string;
  players: LobbyPlayer[];
  draftOrder: string[];
  currentPickIndex: number;
  offeredCards: DisplayCard[];
  pickDeadline: number | null;
  totalDraftPicks: number;
  lastPick: DraftPickRecord | null;
  pickHistory: DraftPickRecord[];
  winnerId: string | null;
  result: MatchResult | null;
  feed: string[];
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "ready" }
  | { type: "start" }
  | { type: "pick"; cardId: string }
  | { type: "mulligan_full" }
  | { type: "mulligan_year" }
  | { type: "confirm" }
  | { type: "swap_positions"; fromIndex: number; toIndex: number }
  | { type: "play_again" };

export type HostMessage =
  | { type: "state"; state: LobbyState }
  | { type: "error"; message: string }
  | { type: "assigned"; playerId: string; isHost: boolean };

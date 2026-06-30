export type GamePhase = "waiting" | "drafting" | "confirming" | "tournament" | "finished";

export type GameMode = "multiplayer" | "solo";

export type BotPersonality = "greedy" | "stars" | "value" | "random";

export type BracketMatchStatus = "pending" | "ready" | "complete" | "bye";

export interface BracketMatch {
  id: string;
  round: number;
  slot: number;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
  status: BracketMatchStatus;
  result: MatchResult | null;
}

export interface TournamentState {
  seeds: string[];
  matches: BracketMatch[];
  currentMatchId: string | null;
  championId: string | null;
}

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
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  botPersonality?: BotPersonality;
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
  gameMode: GameMode;
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
  tournament: TournamentState | null;
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

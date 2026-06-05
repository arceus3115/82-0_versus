import playerData from "../data/players.json";
import {
  buildSnakeOrder,
  generateCardOffer,
  generateFullRoster,
  findAlternateSeason,
  PICK_TIMER_MS,
  PICKS_PER_PLAYER,
  toDisplayOffer,
} from "./draft";
import { aggregateTeam } from "./model";
import { generateLobbyCode, SeededRNG } from "./rng";
import {
  applyOutcome,
  COLLAPSE_LAMBDA,
  FIXED_SEASON_ROUNDS,
  pickWinner,
  simulateRound,
} from "./simulate";
import type {
  ClientMessage,
  GameMode,
  InternalCard,
  LobbyPlayer,
  LobbyState,
  PlayerSeasonRaw,
} from "./types";

const POOL = playerData as PlayerSeasonRaw[];

function createPlayer(id: string, name: string, isHost: boolean): LobbyPlayer {
  return {
    id,
    name,
    ready: isHost,
    isHost,
    team: [],
    muTeam: 0.5,
    sigmaTeam: 0.04,
    tauTeam: 0.05,
    streak: 0,
    maxStreak: 0,
    eliminated: false,
    mulligan: {
      fullUsed: false,
      yearUsed: false,
      fullAvailable: true,
      yearAvailable: true,
      done: false,
    },
  };
}

function draftedIds(state: LobbyState): Set<string> {
  const ids = new Set<string>();
  for (const player of state.players) {
    for (const card of player.team) {
      ids.add(card.id);
    }
  }
  return ids;
}

function syncTeamStats(player: LobbyPlayer): LobbyPlayer {
  const stats = aggregateTeam(player.team);
  return { ...player, ...stats };
}

function publicState(state: LobbyState): LobbyState {
  return structuredClone(state);
}

export class GameEngine {
  state: LobbyState;
  private rng: SeededRNG;
  private offeredInternal: InternalCard[] = [];
  private pickTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (state: LobbyState) => void;

  constructor(hostId: string, hostName: string, onChange: (state: LobbyState) => void) {
    const seed = Date.now() >>> 0;
    this.rng = new SeededRNG(seed);
    this.onChange = onChange;
    this.state = {
      code: generateLobbyCode(this.rng),
      phase: "waiting",
      mode: "fixed_season",
      rngSeed: seed,
      hostId,
      players: [createPlayer(hostId, hostName, true)],
      draftOrder: [],
      currentPickIndex: 0,
      offeredCards: [],
      pickDeadline: null,
      totalDraftPicks: 0,
      simulationRound: 0,
      maxRounds: FIXED_SEASON_ROUNDS,
      collapseLambda: COLLAPSE_LAMBDA,
      lastOutcomes: [],
      winnerId: null,
      feed: [],
    };
  }

  static fromSeed(
    hostId: string,
    hostName: string,
    seed: number,
    onChange: (state: LobbyState) => void,
  ) {
    const engine = new GameEngine(hostId, hostName, onChange);
    engine.state.rngSeed = seed;
    engine.rng = new SeededRNG(seed);
    engine.state.code = generateLobbyCode(engine.rng);
    return engine;
  }

  getState() {
    return publicState(this.state);
  }

  private emit() {
    this.onChange(publicState(this.state));
  }

  private pushFeed(message: string) {
    this.state.feed = [message, ...this.state.feed].slice(0, 12);
  }

  private clearPickTimer() {
    if (this.pickTimer) {
      clearTimeout(this.pickTimer);
      this.pickTimer = null;
    }
  }

  private currentPickerId(): string | null {
    return this.state.draftOrder[this.state.currentPickIndex] ?? null;
  }

  private offerCardsForCurrentPick() {
    this.offeredInternal = generateCardOffer(POOL, draftedIds(this.state), this.rng);
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    this.state.pickDeadline = Date.now() + PICK_TIMER_MS;
    this.clearPickTimer();
    this.pickTimer = setTimeout(() => this.autoPick(), PICK_TIMER_MS);
    const picker = this.state.players.find((p) => p.id === this.currentPickerId());
    if (picker) {
      this.pushFeed(`${picker.name}'s pick — choose a card!`);
    }
    this.emit();
  }

  private autoPick() {
    if (this.state.phase !== "drafting") return;
    const pickerId = this.currentPickerId();
    if (!pickerId) return;
    const cardId = this.state.offeredCards[0]?.id;
    if (cardId) this.handlePick(pickerId, cardId, true);
  }

  private beginDraft() {
    const ids = this.state.players.map((p) => p.id);
    this.state.draftOrder = buildSnakeOrder(ids, PICKS_PER_PLAYER);
    this.state.totalDraftPicks = this.state.draftOrder.length;
    this.state.currentPickIndex = 0;
    this.state.phase = "drafting";
    this.pushFeed("Draft started — snake order locked in.");
    this.offerCardsForCurrentPick();
  }

  private beginMulligan() {
    this.state.phase = "mulligan";
    this.state.offeredCards = [];
    this.state.pickDeadline = null;
    this.clearPickTimer();
    this.pushFeed("Mulligan window — reroll now or skip.");
    this.emit();
  }

  private allMulligansDone() {
    return this.state.players.every((p) => p.mulligan.done);
  }

  private beginSimulation() {
    this.state.phase = "simulating";
    this.state.simulationRound = 0;
    this.state.lastOutcomes = [];
    for (const player of this.state.players) {
      player.streak = 0;
      player.maxStreak = 0;
      player.eliminated = false;
    }
    this.pushFeed("Simulation phase — survive the streak.");
    this.emit();
  }

  private finishIfNeeded() {
    if (this.state.mode === "elimination") {
      const alive = this.state.players.filter((p) => !p.eliminated);
      if (alive.length <= 1) {
        this.state.phase = "finished";
        this.state.winnerId = pickWinner(this.state.players, this.state.mode);
        this.pushFeed("Game over — we have a winner.");
        this.emit();
        return true;
      }
    } else if (this.state.simulationRound >= this.state.maxRounds) {
      this.state.phase = "finished";
      this.state.winnerId = pickWinner(this.state.players, this.state.mode);
      this.pushFeed("Season complete — streaks finalized.");
      this.emit();
      return true;
    }
    return false;
  }

  addPlayer(id: string, name: string) {
    if (this.state.phase !== "waiting") return false;
    if (this.state.players.length >= 12) return false;
    if (this.state.players.some((p) => p.id === id)) return false;
    this.state.players.push(createPlayer(id, name, false));
    this.pushFeed(`${name} joined the lobby.`);
    this.emit();
    return true;
  }

  removePlayer(id: string) {
    if (id === this.state.hostId) return;
    const name = this.state.players.find((p) => p.id === id)?.name ?? "Player";
    this.state.players = this.state.players.filter((p) => p.id !== id);
    this.pushFeed(`${name} left the lobby.`);
    this.emit();
  }

  handleMessage(senderId: string, message: ClientMessage) {
    switch (message.type) {
      case "ready":
        this.setReady(senderId);
        break;
      case "start":
        if (senderId !== this.state.hostId) return;
        this.startGame(message.mode);
        break;
      case "pick":
        this.handlePick(senderId, message.cardId, false);
        break;
      case "mulligan_full":
        this.handleFullMulligan(senderId);
        break;
      case "mulligan_year":
        this.handleYearMulligan(senderId, message.playerName);
        break;
      case "mulligan_skip":
        this.handleMulliganSkip(senderId);
        break;
      case "simulate_round":
        if (senderId !== this.state.hostId) return;
        this.runSimulationRound();
        break;
    }
  }

  setReady(playerId: string) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || this.state.phase !== "waiting") return;
    player.ready = true;
    this.emit();
  }

  startGame(mode: GameMode) {
    if (this.state.phase !== "waiting") return;
    if (this.state.players.length < 2) return;
    if (!this.state.players.every((p) => p.ready)) return;
    this.state.mode = mode;
    this.state.maxRounds = mode === "fixed_season" ? FIXED_SEASON_ROUNDS : 99;
    this.beginDraft();
  }

  private handlePick(playerId: string, cardId: string, auto: boolean) {
    if (this.state.phase !== "drafting") return;
    if (this.currentPickerId() !== playerId) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    const card =
      this.offeredInternal.find((c) => c.id === cardId) ?? this.offeredInternal[0];
    if (!card || draftedIds(this.state).has(card.id)) return;

    player.team.push(card);
    const synced = syncTeamStats(player);
    Object.assign(player, synced);

    const label = auto ? "(auto-pick)" : "";
    this.pushFeed(`${player.name} drafted ${card.player_name} ${card.season} ${label}`.trim());

    this.state.currentPickIndex += 1;
    this.clearPickTimer();

    if (this.state.currentPickIndex >= this.state.totalDraftPicks) {
      this.state.offeredCards = [];
      this.state.pickDeadline = null;
      this.beginMulligan();
      return;
    }

    this.offerCardsForCurrentPick();
  }

  private handleFullMulligan(playerId: string) {
    if (this.state.phase !== "mulligan") return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.mulligan.done || player.mulligan.fullUsed) return;

    const ids = draftedIds(this.state);
    for (const card of player.team) ids.delete(card.id);

    const roster = generateFullRoster(POOL, ids, this.rng);
    player.team = roster;
    Object.assign(player, syncTeamStats(player));
    player.mulligan.fullUsed = true;
    player.mulligan.done = true;
    this.pushFeed(`${player.name} used a full roster mulligan.`);
    this.emit();
    if (this.allMulligansDone()) this.beginSimulation();
  }

  private handleYearMulligan(playerId: string, playerName: string) {
    if (this.state.phase !== "mulligan") return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.mulligan.done || player.mulligan.yearUsed) return;

    const idx = player.team.findIndex((c) => c.player_name === playerName);
    if (idx < 0) return;

    const ids = draftedIds(this.state);
    ids.delete(player.team[idx].id);
    const replacement = findAlternateSeason(POOL, playerName, ids, this.rng);
    if (!replacement) return;

    player.team[idx] = replacement;
    Object.assign(player, syncTeamStats(player));
    player.mulligan.yearUsed = true;
    player.mulligan.done = true;
    this.pushFeed(`${player.name} year-mulliganed ${playerName}.`);
    this.emit();
    if (this.allMulligansDone()) this.beginSimulation();
  }

  private handleMulliganSkip(playerId: string) {
    if (this.state.phase !== "mulligan") return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.mulligan.done) return;
    player.mulligan.done = true;
    this.pushFeed(`${player.name} skipped mulligans.`);
    this.emit();
    if (this.allMulligansDone()) this.beginSimulation();
  }

  runSimulationRound() {
    if (this.state.phase !== "simulating") return;

    const round = this.state.simulationRound + 1;
    const outcomes = [];
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const outcome = simulateRound(player, round, this.rng, this.state.collapseLambda);
      outcomes.push(outcome);
      const updated = applyOutcome(player, outcome, this.state.mode);
      Object.assign(player, updated);
      const name = player.name;
      const result = outcome.won ? `W — ${outcome.flavor}` : `L — ${outcome.flavor}`;
      this.pushFeed(`R${round}: ${name} ${result}`);
    }

    this.state.simulationRound = round;
    this.state.lastOutcomes = outcomes;
    this.emit();

    if (!this.finishIfNeeded() && this.state.phase === "simulating") {
      this.emit();
    }
  }

  destroy() {
    this.clearPickTimer();
  }
}

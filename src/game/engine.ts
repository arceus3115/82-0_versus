import {
  buildDraftOrder,
  generateCardOffer,
  findAlternateSeason,
  getDraftedPool,
  LOBBY_PLAYER_COUNT,
  normalizePlayerName,
  PICK_TIMER_MS,
  PICKS_PER_PLAYER,
  getOfferExclusions,
  toDisplayOffer,
} from "./draft";
import { aggregateTeam, toDisplayCard } from "./model";
import { resolveMatch } from "./resolve";
import { generateLobbyCode, SeededRNG } from "./rng";
import type {
  ClientMessage,
  DraftPickRecord,
  InternalCard,
  LobbyPlayer,
  LobbyState,
  PlayerSeasonRaw,
} from "./types";

function createPlayer(id: string, name: string, isHost: boolean): LobbyPlayer {
  return {
    id,
    name,
    ready: isHost,
    confirmed: false,
    isHost,
    team: [],
    muTeam: 0.5,
    sigmaTeam: 0.04,
    tauTeam: 0.05,
    mulligan: { fullUsed: false, yearUsed: false },
  };
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
  private pool: PlayerSeasonRaw[];
  private rng: SeededRNG;
  private offeredInternal: InternalCard[] = [];
  private recentOfferNames: string[] = [];
  private pickTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (state: LobbyState) => void;

  constructor(
    hostId: string,
    hostName: string,
    pool: PlayerSeasonRaw[],
    onChange: (state: LobbyState) => void,
  ) {
    this.pool = pool;
    const seed = Date.now() >>> 0;
    this.rng = new SeededRNG(seed);
    this.onChange = onChange;
    this.state = {
      code: generateLobbyCode(this.rng),
      phase: "waiting",
      rngSeed: seed,
      hostId,
      players: [createPlayer(hostId, hostName, true)],
      draftOrder: [],
      currentPickIndex: 0,
      offeredCards: [],
      pickDeadline: null,
      totalDraftPicks: 0,
      lastPick: null,
      pickHistory: [],
      winnerId: null,
      result: null,
      feed: [],
    };
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

  private mixRngEntropy() {
    const nextSeed = (Date.now() ^ Math.floor(this.rng.next() * 0xffffffff)) >>> 0;
    this.rng = new SeededRNG(nextSeed || 1);
    this.state.rngSeed = nextSeed;
  }

  private recentOfferSet(): Set<string> {
    return new Set(this.recentOfferNames);
  }

  private rememberOffer(cards: InternalCard[]) {
    for (const card of cards) {
      this.recentOfferNames.push(normalizePlayerName(card.player_name));
    }
    this.recentOfferNames = this.recentOfferNames.slice(-80);
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
    const drafted = getDraftedPool(this.state.players);
    this.offeredInternal = generateCardOffer(this.pool, drafted, this.rng, this.recentOfferSet());
    this.rememberOffer(this.offeredInternal);
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    this.state.pickDeadline = Date.now() + PICK_TIMER_MS;
    this.clearPickTimer();
    this.pickTimer = setTimeout(() => this.autoPick(), PICK_TIMER_MS);
    const picker = this.state.players.find((p) => p.id === this.currentPickerId());
    if (picker) {
      this.pushFeed(`Pick ${this.state.currentPickIndex + 1}: ${picker.name} is on the clock.`);
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
    this.mixRngEntropy();
    this.recentOfferNames = [];
    const ids = this.state.players.map((p) => p.id);
    this.state.draftOrder = buildDraftOrder(ids, PICKS_PER_PLAYER);
    this.state.totalDraftPicks = this.state.draftOrder.length;
    this.state.currentPickIndex = 0;
    this.state.lastPick = null;
    this.state.pickHistory = [];
    this.state.phase = "drafting";
    const label = ids.length === 2 ? "alternating picks" : "snake draft";
    this.pushFeed(`Draft started — ${label}.`);
    this.offerCardsForCurrentPick();
  }

  private beginConfirming() {
    this.state.phase = "confirming";
    this.state.offeredCards = [];
    this.state.pickDeadline = null;
    this.clearPickTimer();
    for (const player of this.state.players) {
      player.confirmed = false;
    }
    this.pushFeed("Draft complete — confirm your lineup to finish.");
    this.emit();
  }

  private tryFinish() {
    if (!this.state.players.every((p) => p.confirmed)) return;
    const result = resolveMatch(this.state.players, this.rng);
    this.state.result = result;
    this.state.winnerId = result.winnerId;
    this.state.phase = "finished";

    if (result.isTie) {
      this.pushFeed(`Tie game — both teams at ${result.scores[0]?.rating ?? "—"} points.`);
    } else {
      const winner = this.state.players.find((p) => p.id === result.winnerId);
      const pts = result.predictedStatlines.find((l) => l.playerId === result.winnerId)?.PTS ?? "—";
      this.pushFeed(`${winner?.name} wins — ${pts} team points.`);
    }

    for (const detail of result.simulationDetails) {
      const story = detail.playerLogs.map((log) => `${log.player_name}: ${log.label}`).join(", ");
      this.pushFeed(`${detail.teamName} — ${story}`);
    }

    this.emit();
  }

  addPlayer(id: string, name: string) {
    if (this.state.phase !== "waiting") return false;
    if (this.state.players.length >= LOBBY_PLAYER_COUNT) return false;
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
        this.startGame();
        break;
      case "pick":
        this.handlePick(senderId, message.cardId, false);
        break;
      case "mulligan_full":
        this.handleFullMulligan(senderId);
        break;
      case "mulligan_year":
        this.handleYearMulligan(senderId);
        break;
      case "confirm":
        this.handleConfirm(senderId);
        break;
      case "swap_positions":
        this.handleSwapPositions(senderId, message.fromIndex, message.toIndex);
        break;
      case "play_again":
        this.handlePlayAgain();
        break;
    }
  }

  setReady(playerId: string) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || this.state.phase !== "waiting") return;
    player.ready = true;
    this.emit();
  }

  startGame() {
    if (this.state.phase !== "waiting") return;
    if (this.state.players.length !== LOBBY_PLAYER_COUNT) return;
    if (!this.state.players.every((p) => p.ready)) return;
    this.beginDraft();
  }

  private handlePick(playerId: string, cardId: string, auto: boolean) {
    if (this.state.phase !== "drafting") return;
    if (this.currentPickerId() !== playerId) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    const drafted = getDraftedPool(this.state.players);
    const card = this.offeredInternal.find((c) => c.id === cardId) ?? this.offeredInternal[0];
    if (
      !card ||
      drafted.ids.has(card.id) ||
      drafted.names.has(normalizePlayerName(card.player_name))
    ) {
      return;
    }

    player.team.push(card);
    Object.assign(player, syncTeamStats(player));

    const pickRecord: DraftPickRecord = {
      pickNumber: this.state.currentPickIndex + 1,
      drafterId: player.id,
      drafterName: player.name,
      card: toDisplayCard(card),
    };
    this.state.lastPick = pickRecord;
    this.state.pickHistory = [pickRecord, ...this.state.pickHistory];

    const label = auto ? "(auto-pick)" : "";
    this.pushFeed(`${player.name} drafted ${card.player_name} (${card.season}) ${label}`.trim());

    this.state.currentPickIndex += 1;
    this.clearPickTimer();

    if (this.state.currentPickIndex >= this.state.totalDraftPicks) {
      this.beginConfirming();
      return;
    }

    this.offerCardsForCurrentPick();
  }

  private refreshOfferTimer() {
    this.state.pickDeadline = Date.now() + PICK_TIMER_MS;
    this.clearPickTimer();
    this.pickTimer = setTimeout(() => this.autoPick(), PICK_TIMER_MS);
  }

  private handleFullMulligan(playerId: string) {
    if (this.state.phase !== "drafting") return;
    if (this.currentPickerId() !== playerId) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.mulligan.fullUsed || this.offeredInternal.length === 0) return;

    const drafted = getDraftedPool(this.state.players);
    this.offeredInternal = generateCardOffer(this.pool, drafted, this.rng, this.recentOfferSet());
    this.rememberOffer(this.offeredInternal);
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    player.mulligan.fullUsed = true;
    this.refreshOfferTimer();
    this.pushFeed(`${player.name} rerolled all five choices.`);
    this.emit();
  }

  private handleYearMulligan(playerId: string) {
    if (this.state.phase !== "drafting") return;
    if (this.currentPickerId() !== playerId) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.mulligan.yearUsed || this.offeredInternal.length === 0) return;

    const drafted = getDraftedPool(this.state.players);
    const nextOffer = [...this.offeredInternal];
    const excludeIds = new Set(getOfferExclusions(drafted, this.offeredInternal).ids);
    let changed = 0;

    for (let idx = 0; idx < nextOffer.length; idx++) {
      const current = nextOffer[idx];
      const replacement = findAlternateSeason(this.pool, current.player_name, excludeIds, this.rng);
      if (!replacement) continue;

      excludeIds.delete(current.id);
      excludeIds.add(replacement.id);
      nextOffer[idx] = replacement;
      changed += 1;
    }

    if (changed === 0) return;

    this.offeredInternal = nextOffer;
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    player.mulligan.yearUsed = true;
    this.refreshOfferTimer();
    this.pushFeed(`${player.name} rerolled every season in the offer.`);
    this.emit();
  }

  private handleConfirm(playerId: string) {
    if (this.state.phase !== "confirming") return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.confirmed) return;
    if (player.team.length !== PICKS_PER_PLAYER) return;
    player.confirmed = true;
    this.pushFeed(`${player.name} confirmed their lineup.`);
    this.emit();
    this.tryFinish();
  }

  private handleSwapPositions(playerId: string, fromIndex: number, toIndex: number) {
    if (this.state.phase !== "drafting" && this.state.phase !== "confirming") return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    if (fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= player.team.length ||
      toIndex >= player.team.length
    ) {
      return;
    }

    const roster = [...player.team];
    [roster[fromIndex], roster[toIndex]] = [roster[toIndex], roster[fromIndex]];
    player.team = roster;
    Object.assign(player, syncTeamStats(player));
    this.pushFeed(`${player.name} swapped lineup positions.`);
    this.emit();
  }

  private handlePlayAgain() {
    if (this.state.phase !== "finished") return;

    this.mixRngEntropy();
    this.recentOfferNames = [];

    for (const player of this.state.players) {
      player.team = [];
      player.ready = false;
      player.confirmed = false;
      player.muTeam = 0.5;
      player.sigmaTeam = 0.04;
      player.tauTeam = 0.05;
      player.mulligan = { fullUsed: false, yearUsed: false };
    }

    this.state.phase = "waiting";
    this.state.draftOrder = [];
    this.state.currentPickIndex = 0;
    this.state.offeredCards = [];
    this.state.pickDeadline = null;
    this.state.totalDraftPicks = 0;
    this.state.lastPick = null;
    this.state.pickHistory = [];
    this.state.winnerId = null;
    this.state.result = null;
    this.clearPickTimer();
    this.pushFeed("New game — ready up to draft again.");
    this.emit();
  }

  destroy() {
    this.clearPickTimer();
  }
}

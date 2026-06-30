import {
  advanceWinner,
  applyByeAdvancement,
  buildBracket,
  getMatch,
  getNextResolvableMatch,
  higherSeedWins,
} from "./bracket";
import {
  buildDraftOrder,
  generateCardOffer,
  findAlternateSeason,
  getDraftedPool,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizePlayerName,
  PICK_TIMER_MS,
  PICKS_PER_PLAYER,
  getOfferExclusions,
  toDisplayOffer,
} from "./draft";
import { pickBotCard, randomBotPersonality } from "./botDraft";
import { pickBotNames } from "./botNames";
import { aggregateTeam, toDisplayCard } from "./model";
import { resolveMatch } from "./resolve";
import { generateLobbyCode, SeededRNG } from "./rng";
import type {
  BotPersonality,
  ClientMessage,
  DraftPickRecord,
  InternalCard,
  LobbyPlayer,
  LobbyState,
  PlayerSeasonRaw,
} from "./types";

const PICK_OVERDUE_GRACE_MS = 500;
const PICK_WATCHDOG_INTERVAL_MS = 1_000;
const SOLO_BOT_COUNT = 3;
const BOT_PICK_MIN_MS = 1_000;
const BOT_PICK_MAX_MS = 2_000;

function createPlayer(id: string, name: string, isHost: boolean): LobbyPlayer {
  return {
    id,
    name,
    ready: isHost,
    confirmed: false,
    connected: true,
    isHost,
    team: [],
    muTeam: 0.5,
    sigmaTeam: 0.04,
    tauTeam: 0.05,
    mulligan: { fullUsed: false, yearUsed: false },
  };
}

function createBot(id: string, name: string, personality: BotPersonality): LobbyPlayer {
  return {
    ...createPlayer(id, name, false),
    isBot: true,
    botPersonality: personality,
    ready: true,
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
  private botPickTimer: ReturnType<typeof setTimeout> | null = null;
  private pickWatchdog: ReturnType<typeof setInterval> | null = null;
  private resolvingPick = false;
  private tournamentTimer: ReturnType<typeof setTimeout> | null = null;
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
      gameMode: "multiplayer",
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
      tournament: null,
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

  private clearTournamentTimer() {
    if (this.tournamentTimer) {
      clearTimeout(this.tournamentTimer);
      this.tournamentTimer = null;
    }
  }

  private clearPickTimer() {
    if (this.pickTimer) {
      clearTimeout(this.pickTimer);
      this.pickTimer = null;
    }
  }

  private clearBotPickTimer() {
    if (this.botPickTimer) {
      clearTimeout(this.botPickTimer);
      this.botPickTimer = null;
    }
  }

  private startPickWatchdog() {
    this.stopPickWatchdog();
    this.pickWatchdog = setInterval(() => {
      if (this.state.phase !== "drafting" || this.state.pickDeadline == null) return;
      if (Date.now() > this.state.pickDeadline + PICK_OVERDUE_GRACE_MS) {
        this.forceResolveCurrentPick();
      }
    }, PICK_WATCHDOG_INTERVAL_MS);
  }

  private stopPickWatchdog() {
    if (this.pickWatchdog) {
      clearInterval(this.pickWatchdog);
      this.pickWatchdog = null;
    }
  }

  private currentPickerId(): string | null {
    return this.state.draftOrder[this.state.currentPickIndex] ?? null;
  }

  private ensurePicker(pickerId: string): LobbyPlayer {
    const existing = this.state.players.find((p) => p.id === pickerId);
    if (existing) return existing;

    const recovered = createPlayer(pickerId, "Disconnected", false);
    recovered.ready = true;
    this.state.players.push(recovered);
    this.pushFeed("Recovered a missing drafter to keep the draft moving.");
    return recovered;
  }

  private pickFirstValidCard(): InternalCard | null {
    const drafted = getDraftedPool(this.state.players);
    const isValid = (card: InternalCard) =>
      !drafted.ids.has(card.id) && !drafted.names.has(normalizePlayerName(card.player_name));

    const fromOffer = this.offeredInternal.find(isValid);
    if (fromOffer) return fromOffer;

    this.offeredInternal = generateCardOffer(this.pool, drafted, this.rng, this.recentOfferSet());
    this.rememberOffer(this.offeredInternal);
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    return this.offeredInternal.find(isValid) ?? null;
  }

  private applyPick(player: LobbyPlayer, card: InternalCard, auto: boolean) {
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
    this.clearBotPickTimer();

    if (this.state.currentPickIndex >= this.state.totalDraftPicks) {
      this.beginConfirming();
      return;
    }

    this.offerCardsForCurrentPick();
  }

  private offerCardsForCurrentPick() {
    const drafted = getDraftedPool(this.state.players);
    this.offeredInternal = generateCardOffer(this.pool, drafted, this.rng, this.recentOfferSet());
    this.rememberOffer(this.offeredInternal);
    this.state.offeredCards = toDisplayOffer(this.offeredInternal);
    this.clearPickTimer();
    this.clearBotPickTimer();

    const picker = this.state.players.find((p) => p.id === this.currentPickerId());
    if (picker?.isBot) {
      this.state.pickDeadline = null;
      const delay = BOT_PICK_MIN_MS + this.rng.next() * (BOT_PICK_MAX_MS - BOT_PICK_MIN_MS);
      this.botPickTimer = setTimeout(() => this.executeBotPick(), delay);
    } else {
      this.state.pickDeadline = Date.now() + PICK_TIMER_MS;
      this.pickTimer = setTimeout(() => this.forceResolveCurrentPick(), PICK_TIMER_MS);
    }

    if (picker) {
      this.pushFeed(`Pick ${this.state.currentPickIndex + 1}: ${picker.name} is on the clock.`);
    }
    this.emit();
  }

  private executeBotPick() {
    if (this.state.phase !== "drafting" || this.resolvingPick) return;

    const pickerId = this.currentPickerId();
    const player = pickerId ? this.state.players.find((p) => p.id === pickerId) : null;
    if (!player?.isBot) return;

    this.resolvingPick = true;
    try {
      const drafted = getDraftedPool(this.state.players);
      const personality = player.botPersonality ?? "random";
      const card =
        pickBotCard(this.offeredInternal, personality, drafted, this.rng) ??
        this.pickFirstValidCard();
      if (!card) {
        this.pushFeed("No draftable players left — ending the draft.");
        this.beginConfirming();
        return;
      }
      this.applyPick(player, card, false);
    } finally {
      this.resolvingPick = false;
    }
  }

  private forceResolveCurrentPick() {
    if (this.state.phase !== "drafting" || this.resolvingPick) return;
    this.resolvingPick = true;

    const pickerId = this.currentPickerId();
    try {
      if (!pickerId) {
        if (this.state.currentPickIndex >= this.state.totalDraftPicks) {
          this.beginConfirming();
        } else {
          this.pushFeed("Draft stalled — moving to lineup confirmation.");
          this.beginConfirming();
        }
        return;
      }

      const player = this.ensurePicker(pickerId);
      const card = this.pickFirstValidCard();
      if (!card) {
        this.pushFeed("No draftable players left — ending the draft.");
        this.beginConfirming();
        return;
      }

      this.applyPick(player, card, true);
    } finally {
      this.resolvingPick = false;
    }
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
    const label = ids.length > 2 ? "snake draft" : "back-and-forth draft";
    this.pushFeed(`Draft started — ${label}.`);
    this.startPickWatchdog();
    this.offerCardsForCurrentPick();
  }

  private beginConfirming() {
    this.state.phase = "confirming";
    this.state.offeredCards = [];
    this.state.pickDeadline = null;
    this.clearPickTimer();
    this.clearBotPickTimer();
    this.stopPickWatchdog();
    for (const player of this.state.players) {
      player.confirmed = false;
    }
    if (this.state.gameMode === "solo") {
      for (const player of this.state.players) {
        if (player.isBot && player.team.length === PICKS_PER_PLAYER) {
          player.confirmed = true;
        }
      }
    }
    this.pushFeed("Draft complete — confirm your lineup to start the bracket.");
    this.emit();
    this.tryFinish();
  }

  private beginTournament() {
    this.mixRngEntropy();
    const seeds = this.state.players.map((p) => p.id);
    this.state.tournament = buildBracket(seeds, this.rng);
    applyByeAdvancement(this.state.tournament);
    this.state.phase = "tournament";
    this.state.result = null;
    this.state.winnerId = null;
    this.pushFeed("Lineups locked — single-elimination bracket begins.");
    this.emit();
    this.resolveNextBracketStep();
  }

  private resolveBracketMatch(matchId: string) {
    const tournament = this.state.tournament;
    if (!tournament) return;

    const match = getMatch(tournament, matchId);
    if (!match || match.status !== "ready" || !match.playerAId || !match.playerBId) return;

    const playerA = this.state.players.find((p) => p.id === match.playerAId);
    const playerB = this.state.players.find((p) => p.id === match.playerBId);
    if (!playerA || !playerB) return;

    let result = resolveMatch([playerA, playerB], this.rng);
    if (result.isTie) {
      this.mixRngEntropy();
      result = resolveMatch([playerA, playerB], this.rng);
    }

    let winnerId = result.winnerId;
    if (!winnerId || result.isTie) {
      winnerId = higherSeedWins(tournament.seeds, playerA.id, playerB.id);
      result = { ...result, winnerId, isTie: false };
    }

    match.result = result;
    tournament.currentMatchId = matchId;
    this.state.result = result;

    const loserId = winnerId === playerA.id ? playerB.id : playerA.id;
    const winner = this.state.players.find((p) => p.id === winnerId);
    const loser = this.state.players.find((p) => p.id === loserId);
    const winnerPts = result.predictedStatlines.find((l) => l.playerId === winnerId)?.PTS ?? "—";
    const loserPts = result.predictedStatlines.find((l) => l.playerId === loserId)?.PTS ?? "—";
    this.pushFeed(`${winner?.name} defeats ${loser?.name} — ${winnerPts}–${loserPts} team PTS.`);

    advanceWinner(tournament, matchId, winnerId);
    this.emit();
  }

  private resolveNextBracketStep() {
    const tournament = this.state.tournament;
    if (!tournament) return;

    const next = getNextResolvableMatch(tournament);
    if (!next) {
      if (tournament.championId) {
        this.tournamentTimer = setTimeout(() => this.finishTournament(), 1500);
      }
      return;
    }

    if (next.status === "bye" && next.winnerId) {
      applyByeAdvancement(tournament);
      this.emit();
      this.tournamentTimer = setTimeout(() => this.resolveNextBracketStep(), 400);
      return;
    }

    this.resolveBracketMatch(next.id);
    this.emit();
    this.tournamentTimer = setTimeout(() => this.resolveNextBracketStep(), 1200);
  }

  private finishTournament() {
    const championId = this.state.tournament?.championId ?? null;
    this.state.winnerId = championId;
    this.state.phase = "finished";
    const champion = this.state.players.find((p) => p.id === championId);
    this.pushFeed(`${champion?.name ?? "Unknown"} wins the tournament!`);
    this.emit();
  }

  private tryFinish() {
    for (const player of this.state.players) {
      if (
        (player.isBot || !player.connected) &&
        player.team.length === PICKS_PER_PLAYER &&
        !player.confirmed
      ) {
        player.confirmed = true;
        if (player.isBot) {
          this.pushFeed(`${player.name} locked in.`);
        } else {
          this.pushFeed(`${player.name} auto-confirmed (disconnected).`);
        }
      }
    }
    if (!this.state.players.every((p) => p.confirmed)) return;
    this.beginTournament();
  }

  private ensureSoloBots() {
    for (let i = 1; i <= SOLO_BOT_COUNT; i++) {
      const id = `bot-${i}`;
      if (!this.state.players.some((p) => p.id === id)) {
        this.state.players.push(createBot(id, "Bot", randomBotPersonality(this.rng)));
      }
    }
  }

  private assignBotIdentities() {
    const names = pickBotNames(this.rng, SOLO_BOT_COUNT);
    const bots = this.state.players.filter((p) => p.isBot);
    for (let i = 0; i < bots.length; i++) {
      bots[i].name = names[i] ?? `Bot ${i + 1}`;
      bots[i].botPersonality = randomBotPersonality(this.rng);
    }
  }

  private resetPlayersForNewDraft() {
    for (const player of this.state.players) {
      player.team = [];
      player.confirmed = false;
      player.connected = true;
      player.ready = player.isHost || !!player.isBot;
      player.muTeam = 0.5;
      player.sigmaTeam = 0.04;
      player.tauTeam = 0.05;
      player.mulligan = { fullUsed: false, yearUsed: false };
    }
  }

  startSoloGame() {
    if (this.state.phase !== "waiting" && this.state.phase !== "finished") return;

    this.mixRngEntropy();
    this.recentOfferNames = [];
    this.state.gameMode = "solo";
    this.state.code = "SOLO";
    this.state.winnerId = null;
    this.state.result = null;
    this.state.tournament = null;
    this.state.draftOrder = [];
    this.state.currentPickIndex = 0;
    this.state.offeredCards = [];
    this.state.pickDeadline = null;
    this.state.totalDraftPicks = 0;
    this.state.lastPick = null;
    this.state.pickHistory = [];
    this.clearPickTimer();
    this.clearBotPickTimer();
    this.clearTournamentTimer();

    this.ensureSoloBots();
    this.assignBotIdentities();
    this.resetPlayersForNewDraft();
    this.pushFeed("Solo game — 4-player snake draft.");
    this.beginDraft();
  }

  addPlayer(id: string, name: string) {
    if (this.state.phase !== "waiting") return false;
    if (this.state.players.length >= MAX_PLAYERS) return false;
    if (this.state.players.some((p) => p.id === id)) return false;
    this.state.players.push(createPlayer(id, name, false));
    this.pushFeed(`${name} joined the lobby.`);
    this.emit();
    return true;
  }

  removePlayer(id: string) {
    if (id === this.state.hostId) return;
    const player = this.state.players.find((p) => p.id === id);
    if (!player) return;

    if (this.state.phase === "waiting") {
      this.state.players = this.state.players.filter((p) => p.id !== id);
      this.pushFeed(`${player.name} left the lobby.`);
      this.emit();
      return;
    }

    if (!player.connected) return;
    player.connected = false;
    this.pushFeed(`${player.name} disconnected.`);
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
    const count = this.state.players.length;
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) return;
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
      if (auto) this.forceResolveCurrentPick();
      return;
    }

    this.applyPick(player, card, auto);
  }

  private refreshOfferTimer() {
    this.state.pickDeadline = Date.now() + PICK_TIMER_MS;
    this.clearPickTimer();
    this.pickTimer = setTimeout(() => this.forceResolveCurrentPick(), PICK_TIMER_MS);
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

    if (this.state.gameMode === "solo") {
      this.startSoloGame();
      return;
    }

    this.mixRngEntropy();
    this.recentOfferNames = [];

    for (const player of this.state.players) {
      player.team = [];
      player.ready = false;
      player.confirmed = false;
      player.connected = true;
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
    this.state.tournament = null;
    this.clearPickTimer();
    this.clearTournamentTimer();
    this.pushFeed("New game — ready up to draft again.");
    this.emit();
  }

  destroy() {
    this.clearPickTimer();
    this.clearBotPickTimer();
    this.stopPickWatchdog();
    this.clearTournamentTimer();
  }
}

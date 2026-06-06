import { generateLobbyCode, SeededRNG } from "../game/rng";
import type { ClientMessage, HostMessage, LobbyState } from "../game/types";
import type { ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

const REGISTRY_CHANNEL = "versus-registry";
const JOIN_TIMEOUT_MS = 8_000;

type WireMessage =
  | { kind: "client"; senderId: string; message: ClientMessage }
  | { kind: "host"; message: HostMessage }
  | { kind: "host-online"; code: string }
  | { kind: "host-offline"; code: string }
  | { kind: "ping"; code: string };

function lobbyChannelName(code: string) {
  return `versus-lobby-${code.toUpperCase()}`;
}

export class LocalConnection implements GameTransport {
  mode = "local" as const;
  role: ConnectionRole | null = null;
  localPlayerId: string | null = null;
  lobbyCode: string | null = null;

  private handlers: GameTransportHandlers;
  private lobbyChannel: BroadcastChannel | null = null;
  private registryChannel: BroadcastChannel | null = null;
  private connectedGuests = new Set<string>();

  constructor(handlers: GameTransportHandlers) {
    this.handlers = handlers;
  }

  async createLobby(): Promise<{ code: string; playerId: string }> {
    const code = generateLobbyCode(new SeededRNG((Math.random() * 2 ** 32) >>> 0));
    const playerId = `host-${code}`;

    this.role = "host";
    this.localPlayerId = playerId;
    this.lobbyCode = code;
    this.openChannels(code);

    this.announceHost(code);

    return { code, playerId };
  }

  async joinLobby(code: string, guestName: string): Promise<string> {
    const normalized = code.trim().toUpperCase();
    const playerId = crypto.randomUUID();

    this.role = "guest";
    this.localPlayerId = playerId;
    this.lobbyCode = normalized;
    this.openChannels(normalized);

    const hostVisible = await this.waitForHost(normalized);
    if (!hostVisible) {
      this.destroy();
      throw new Error(
        "No local host found for that code. Open a host tab first (Local mode) with the same code.",
      );
    }

    await this.sendJoinAndWait(playerId, guestName);
    return playerId;
  }

  send(message: ClientMessage) {
    if (this.role === "host") {
      window.dispatchEvent(
        new CustomEvent("host-message", {
          detail: { senderId: this.localPlayerId, message },
        }),
      );
      return;
    }

    if (!this.lobbyChannel || !this.localPlayerId) return;
    this.lobbyChannel.postMessage({
      kind: "client",
      senderId: this.localPlayerId,
      message,
    } satisfies WireMessage);
  }

  broadcastState(state: LobbyState) {
    this.postHost({ type: "state", state });
  }

  destroy() {
    if (this.lobbyCode && this.role === "host") {
      this.registryChannel?.postMessage({
        kind: "host-offline",
        code: this.lobbyCode,
      } satisfies WireMessage);
    }
    this.lobbyChannel?.close();
    this.registryChannel?.close();
    this.lobbyChannel = null;
    this.registryChannel = null;
    this.connectedGuests.clear();
  }

  private openChannels(code: string) {
    this.lobbyChannel = new BroadcastChannel(lobbyChannelName(code));
    this.registryChannel = new BroadcastChannel(REGISTRY_CHANNEL);

    this.lobbyChannel.onmessage = (event: MessageEvent<WireMessage>) => {
      this.onLobbyMessage(event.data);
    };

    if (this.role === "host") {
      this.registryChannel.onmessage = (event: MessageEvent<WireMessage>) => {
        if (event.data.kind === "ping" && event.data.code === code) {
          this.announceHost(code);
        }
      };
    }
  }

  private announceHost(code: string) {
    this.registryChannel?.postMessage({
      kind: "host-online",
      code,
    } satisfies WireMessage);
  }

  private onLobbyMessage(data: WireMessage) {
    if (data.kind === "client" && this.role === "host") {
      this.connectedGuests.add(data.senderId);
      window.dispatchEvent(
        new CustomEvent("host-message", {
          detail: { senderId: data.senderId, message: data.message },
        }),
      );
      return;
    }

    if (data.kind === "host" && this.role === "guest") {
      const msg = data.message;
      if (msg.type === "state") this.handlers.onState(msg.state);
      if (msg.type === "assigned") {
        this.localPlayerId = msg.playerId;
        this.handlers.onAssigned(msg.playerId, msg.isHost);
      }
      if (msg.type === "error") this.handlers.onError(msg.message);
    }
  }

  private postHost(message: HostMessage) {
    this.lobbyChannel?.postMessage({ kind: "host", message } satisfies WireMessage);
  }

  private waitForHost(code: string): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (value: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        this.registryChannel?.removeEventListener("message", onRegistry);
        resolve(value);
      };

      const onRegistry = (event: MessageEvent<WireMessage>) => {
        if (event.data.kind === "host-online" && event.data.code === code) {
          finish(true);
        }
      };

      this.registryChannel?.addEventListener("message", onRegistry);
      this.registryChannel?.postMessage({ kind: "ping", code } satisfies WireMessage);
      const timer = setTimeout(() => finish(false), JOIN_TIMEOUT_MS);
    });
  }

  private sendJoinAndWait(playerId: string, guestName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out joining local lobby. Is the host tab still open?"));
      }, JOIN_TIMEOUT_MS);

      const onHostMessage = (event: MessageEvent<WireMessage>) => {
        if (event.data.kind !== "host") return;
        const msg = event.data.message;
        if (msg.type === "assigned" && msg.playerId === playerId) {
          cleanup();
          resolve();
        }
        if (msg.type === "state") {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.lobbyChannel?.removeEventListener("message", onHostMessage);
      };

      this.lobbyChannel?.addEventListener("message", onHostMessage);
      this.lobbyChannel?.postMessage({
        kind: "client",
        senderId: playerId,
        message: { type: "join", name: guestName },
      } satisfies WireMessage);
    });
  }
}

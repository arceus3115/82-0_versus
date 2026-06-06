import Peer, { type DataConnection } from "peerjs";
import { generateLobbyCode, SeededRNG } from "../game/rng";
import type { ClientMessage, HostMessage, LobbyState } from "../game/types";
import { requirePeerServerConfig, wakeSignalingServer } from "./peerConfig";
import type { ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

const PEER_PREFIX = "versus-";
const DEV_TIMEOUT_MS = 15_000;
const PROD_TIMEOUT_MS = 90_000;
const DEV_MAX_ATTEMPTS = 2;
const PROD_MAX_ATTEMPTS = 5;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Timed out") ||
    msg.includes("Lost connection") ||
    msg.includes("Could not connect") ||
    msg.includes("network") ||
    msg.includes("Network")
  );
}

export class PeerConnection implements GameTransport {
  mode = "online" as const;
  role: ConnectionRole | null = null;
  localPlayerId: string | null = null;
  lobbyCode: string | null = null;

  private peer: Peer | null = null;
  private dataConnections = new Map<string, DataConnection>();
  private handlers: GameTransportHandlers;
  private latestState: LobbyState | null = null;

  constructor(handlers: GameTransportHandlers) {
    this.handlers = handlers;
  }

  async createLobby(): Promise<{ code: string; playerId: string }> {
    const { code, peerId } = await this.initHostPeer();
    this.role = "host";
    this.localPlayerId = peerId;
    this.lobbyCode = code;
    return { code, playerId: peerId };
  }

  async joinLobby(code: string, guestName: string): Promise<string> {
    const playerId = crypto.randomUUID();
    const normalized = code.trim().toUpperCase();
    await this.initGuestPeer(playerId, normalized, guestName);
    this.role = "guest";
    this.localPlayerId = playerId;
    this.lobbyCode = normalized;
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
    const hostConn = [...this.dataConnections.values()][0];
    if (!hostConn?.open) {
      this.handlers.onError("Lost connection to host.");
      return;
    }
    hostConn.send(message);
  }

  broadcastState(state: LobbyState) {
    this.latestState = state;
    const payload: HostMessage = { type: "state", state };
    for (const conn of this.dataConnections.values()) {
      if (conn.open) conn.send(payload);
    }
  }

  destroy() {
    for (const conn of this.dataConnections.values()) {
      conn.close();
    }
    this.dataConnections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.latestState = null;
  }

  private get timeouts() {
    return {
      attemptMs: import.meta.env.DEV ? DEV_TIMEOUT_MS : PROD_TIMEOUT_MS,
      maxAttempts: import.meta.env.DEV ? DEV_MAX_ATTEMPTS : PROD_MAX_ATTEMPTS,
    };
  }

  private status(message: string) {
    this.handlers.onConnectingStatus?.(message);
  }

  private makeCode() {
    return generateLobbyCode(new SeededRNG((Math.random() * 2 ** 32) >>> 0));
  }

  private async peerOptions() {
    const config = await requirePeerServerConfig();
    return {
      config,
      options: {
        host: config.host,
        port: config.port,
        path: "/",
        secure: config.secure,
        debug: import.meta.env.DEV ? 2 : 0,
      },
    };
  }

  private async initHostPeer(): Promise<{ code: string; peerId: string }> {
    const { config, options } = await this.peerOptions();
    const { attemptMs, maxAttempts } = this.timeouts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.status(
        attempt === 1
          ? "Waking up signaling server…"
          : `Signaling server waking up… retry ${attempt} of ${maxAttempts}`,
      );
      await wakeSignalingServer(config);
      if (attempt > 1) await delay(1200 * attempt);

      try {
        this.status(
          attempt === 1 ? "Registering your lobby…" : "Registering your lobby… hang tight",
        );
        return await this.registerHostOnce(options, attemptMs);
      } catch (err) {
        this.destroyPeerOnly();
        if (attempt >= maxAttempts || !isRetryableError(err)) {
          throw new Error(
            import.meta.env.DEV
              ? `${err instanceof Error ? err.message : String(err)} Start npm run dev:online.`
              : `Signaling server is still waking up. Try Create lobby again in a few seconds.`,
          );
        }
      }
    }

    throw new Error("Could not register host with signaling server.");
  }

  private destroyPeerOnly() {
    this.peer?.destroy();
    this.peer = null;
  }

  private registerHostOnce(
    options: {
      host: string;
      port: number;
      path: string;
      secure: boolean;
      debug: number;
    },
    timeoutMs: number,
  ): Promise<{ code: string; peerId: string }> {
    return new Promise((resolve, reject) => {
      const start = () => {
        const code = this.makeCode();
        const peerId = `${PEER_PREFIX}${code}`;
        const peer = new Peer(peerId, options);
        this.peer = peer;

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Timed out registering host with signaling server."));
        }, timeoutMs);

        const cleanup = () => {
          clearTimeout(timer);
          peer.destroy();
          if (this.peer === peer) this.peer = null;
        };

        peer.on("open", () => {
          clearTimeout(timer);
          resolve({ code, peerId });
        });

        peer.on("error", (err) => {
          const msg = String(err);
          if (msg.includes("is taken") || msg.includes("unavailable")) {
            cleanup();
            start();
            return;
          }
          cleanup();
          reject(err);
        });

        peer.on("connection", (conn) => this.wireHostConnection(conn));
      };

      start();
    });
  }

  private pushStateToGuest(conn: DataConnection) {
    if (!this.latestState || !conn.open) return;
    conn.send({ type: "state", state: this.latestState } satisfies HostMessage);
  }

  private wireHostConnection(conn: DataConnection) {
    const register = () => {
      conn.off("open", register);
      this.dataConnections.set(conn.peer, conn);
      conn.send({
        type: "assigned",
        playerId: conn.peer,
        isHost: false,
      } satisfies HostMessage);
      this.pushStateToGuest(conn);
      this.handlers.onPeerConnected?.(conn.peer);
    };

    conn.on("open", register);
    conn.on("data", (raw) => {
      window.dispatchEvent(
        new CustomEvent("host-message", {
          detail: { senderId: conn.peer, message: raw as ClientMessage },
        }),
      );
    });
    conn.on("close", () => {
      this.dataConnections.delete(conn.peer);
      this.handlers.onPeerDisconnected?.(conn.peer);
    });
    conn.on("error", (err) => this.handlers.onError(String(err)));
  }

  private async initGuestPeer(
    playerId: string,
    code: string,
    guestName: string,
  ): Promise<void> {
    const { config, options } = await this.peerOptions();
    const { attemptMs, maxAttempts } = this.timeouts;
    const hostPeerId = `${PEER_PREFIX}${code}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.status(
        attempt === 1
          ? "Waking up signaling server…"
          : `Connecting to host… retry ${attempt} of ${maxAttempts}`,
      );
      await wakeSignalingServer(config);
      if (attempt > 1) await delay(1200 * attempt);

      try {
        this.status(attempt === 1 ? "Finding the host lobby…" : "Still looking for the host…");
        await this.joinHostOnce(options, playerId, hostPeerId, guestName, attemptMs);
        return;
      } catch (err) {
        this.destroyPeerOnly();
        if (attempt >= maxAttempts || !isRetryableError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Could not reach host")) throw err;
          throw new Error(
            msg.includes("Timed out")
              ? `Could not join in time. Confirm the code "${code}" and that the host is still online.`
              : msg,
          );
        }
      }
    }
  }

  private joinHostOnce(
    options: {
      host: string;
      port: number;
      path: string;
      secure: boolean;
      debug: number;
    },
    playerId: string,
    hostPeerId: string,
    guestName: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(playerId, options);
      this.peer = peer;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Connection timed out waiting for host."));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        peer.destroy();
        if (this.peer === peer) this.peer = null;
      };

      const fail = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      peer.on("open", () => {
        const conn = peer.connect(hostPeerId, { reliable: true });
        let joined = false;

        conn.on("open", () => {
          this.dataConnections.set(hostPeerId, conn);
          conn.send({ type: "join", name: guestName } satisfies ClientMessage);
        });

        conn.on("data", (raw) => {
          const msg = raw as HostMessage;
          if (msg.type === "state") {
            this.handlers.onState(msg.state);
            if (!joined) {
              joined = true;
              clearTimeout(timer);
              resolve();
            }
          }
          if (msg.type === "assigned") {
            this.localPlayerId = msg.playerId;
            this.handlers.onAssigned(msg.playerId, msg.isHost);
          }
          if (msg.type === "error") this.handlers.onError(msg.message);
        });

        conn.on("close", () => {
          if (!joined) fail(new Error("Disconnected from host before lobby synced."));
        });

        conn.on("error", (err) => fail(err));
      });

      peer.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("Lost connection") || msg.includes("Could not connect")) {
          fail(
            new Error(
              `Could not reach host lobby "${hostPeerId.replace(PEER_PREFIX, "")}". Confirm the code and that the host is online.`,
            ),
          );
          return;
        }
        fail(err);
      });
    });
  }
}

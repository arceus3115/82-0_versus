import Peer, { type DataConnection } from "peerjs";
import { generateLobbyCode, SeededRNG } from "../game/rng";
import type { ClientMessage, HostMessage, LobbyState } from "../game/types";
import { requirePeerServerConfig } from "./peerConfig";
import type { ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

const PEER_PREFIX = "versus-";
const CONNECT_TIMEOUT_MS = 15_000;

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

  private makeCode() {
    return generateLobbyCode(new SeededRNG((Math.random() * 2 ** 32) >>> 0));
  }

  private async peerOptions() {
    const config = await requirePeerServerConfig();
    return {
      host: config.host,
      port: config.port,
      // PeerJS builds wss://host:port + path + "peerjs"; path must not be empty.
      path: "/",
      secure: config.secure,
      debug: import.meta.env.DEV ? 2 : 0,
    };
  }

  private async initHostPeer(): Promise<{ code: string; peerId: string }> {
    const options = await this.peerOptions();
    return new Promise((resolve, reject) => {
      const code = this.makeCode();
      const peerId = `${PEER_PREFIX}${code}`;
      const peer = new Peer(peerId, options);
      this.peer = peer;

      const fail = (err: unknown) => {
        const hint = import.meta.env.DEV
          ? " Start the local Peer server: npm run dev:online"
          : "";
        reject(new Error(`${err instanceof Error ? err.message : String(err)}${hint}`));
      };

      const timer = setTimeout(() => {
        fail(new Error("Timed out registering host with signaling server."));
      }, CONNECT_TIMEOUT_MS);

      peer.on("open", () => {
        clearTimeout(timer);
        resolve({ code, peerId });
      });

      peer.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("is taken") || msg.includes("unavailable")) {
          clearTimeout(timer);
          this.peer?.destroy();
          this.initHostPeer().then(resolve).catch(reject);
          return;
        }
        fail(err);
      });

      peer.on("connection", (conn) => this.wireHostConnection(conn));
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
    const options = await this.peerOptions();
    return new Promise((resolve, reject) => {
      const peer = new Peer(playerId, options);
      this.peer = peer;
      const hostPeerId = `${PEER_PREFIX}${code}`;

      const timer = setTimeout(() => {
        fail(
          new Error(
            import.meta.env.DEV
              ? "Connection timed out. Run npm run dev:online and keep the host tab open."
              : "Connection timed out. Check the join code and that the host is still online.",
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      const fail = (err: unknown) => {
        clearTimeout(timer);
        reject(new Error(err instanceof Error ? err.message : String(err)));
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
          this.handlers.onError("Disconnected from host.");
        });

        conn.on("error", (err) => fail(err));
      });

      peer.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("Lost connection") || msg.includes("Could not connect")) {
          fail(
            new Error(
              `Could not reach host lobby "${code}". Confirm the code and that the host is online.`,
            ),
          );
          return;
        }
        fail(err);
      });
    });
  }
}

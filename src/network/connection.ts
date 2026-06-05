import Peer, { type DataConnection } from "peerjs";
import { generateLobbyCode, SeededRNG } from "../game/rng";
import type { ClientMessage, HostMessage, LobbyState } from "../game/types";

const PEER_PREFIX = "versus-";

export type ConnectionRole = "host" | "guest";

export interface GameConnectionHandlers {
  onState: (state: LobbyState) => void;
  onAssigned: (playerId: string, isHost: boolean) => void;
  onError: (message: string) => void;
  onPeerDisconnected?: (peerId: string) => void;
}

export class GameConnection {
  private peer: Peer | null = null;
  private dataConnections = new Map<string, DataConnection>();
  private handlers: GameConnectionHandlers;
  role: ConnectionRole | null = null;
  localPlayerId: string | null = null;
  lobbyCode: string | null = null;

  constructor(handlers: GameConnectionHandlers) {
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
    hostConn?.send(message);
  }

  broadcastState(state: LobbyState) {
    const payload: HostMessage = { type: "state", state };
    for (const conn of this.dataConnections.values()) {
      conn.send(payload);
    }
  }

  destroy() {
    for (const conn of this.dataConnections.values()) {
      conn.close();
    }
    this.dataConnections.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  private makeCode(): string {
    return generateLobbyCode(new SeededRNG((Math.random() * 2 ** 32) >>> 0));
  }

  private initHostPeer(): Promise<{ code: string; peerId: string }> {
    return new Promise((resolve, reject) => {
      const code = this.makeCode();
      const peerId = `${PEER_PREFIX}${code}`;

      const peer = new Peer(peerId);
      this.peer = peer;

      peer.on("open", () => resolve({ code, peerId }));
      peer.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("is taken") || msg.includes("unavailable")) {
          this.peer?.destroy();
          this.initHostPeer().then(resolve).catch(reject);
          return;
        }
        reject(err);
      });

      peer.on("connection", (conn) => this.wireHostConnection(conn));
    });
  }

  private wireHostConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.dataConnections.set(conn.peer, conn);
      conn.send({
        type: "assigned",
        playerId: conn.peer,
        isHost: false,
      } satisfies HostMessage);
    });

    conn.on("data", (raw) => {
      const message = raw as ClientMessage;
      window.dispatchEvent(
        new CustomEvent("host-message", {
          detail: { senderId: conn.peer, message },
        }),
      );
    });

    conn.on("close", () => {
      this.dataConnections.delete(conn.peer);
      this.handlers.onPeerDisconnected?.(conn.peer);
    });
  }

  private initGuestPeer(playerId: string, code: string, guestName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(playerId);
      this.peer = peer;

      peer.on("open", () => {
        const hostPeerId = `${PEER_PREFIX}${code}`;
        const conn = peer.connect(hostPeerId, { reliable: true });

        conn.on("open", () => {
          this.dataConnections.set(hostPeerId, conn);
          conn.send({ type: "join", name: guestName } satisfies ClientMessage);
          resolve();
        });

        conn.on("data", (raw) => {
          const msg = raw as HostMessage;
          if (msg.type === "state") this.handlers.onState(msg.state);
          if (msg.type === "assigned") {
            this.localPlayerId = msg.playerId;
            this.handlers.onAssigned(msg.playerId, msg.isHost);
          }
          if (msg.type === "error") this.handlers.onError(msg.message);
        });

        conn.on("error", reject);
      });

      peer.on("error", reject);
    });
  }
}

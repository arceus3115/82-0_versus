import Peer, { type DataConnection } from "peerjs";
import { generateLobbyCode, SeededRNG } from "../game/rng";
import type { ClientMessage, HostMessage, LobbyState } from "../game/types";
import type { ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

const PEER_PREFIX = "versus-";
const CONNECT_TIMEOUT_MS = 12_000;

function peerOptions() {
  if (import.meta.env.DEV) {
    return {
      host: "localhost",
      port: 9000,
      path: "/",
      secure: false,
    };
  }
  return undefined;
}

export class PeerConnection implements GameTransport {
  mode = "online" as const;
  role: ConnectionRole | null = null;
  localPlayerId: string | null = null;
  lobbyCode: string | null = null;

  private peer: Peer | null = null;
  private dataConnections = new Map<string, DataConnection>();
  private handlers: GameTransportHandlers;

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
    hostConn?.send(message);
  }

  broadcastState(state: LobbyState) {
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
  }

  private makeCode() {
    return generateLobbyCode(new SeededRNG((Math.random() * 2 ** 32) >>> 0));
  }

  private initHostPeer(): Promise<{ code: string; peerId: string }> {
    return new Promise((resolve, reject) => {
      const code = this.makeCode();
      const peerId = `${PEER_PREFIX}${code}`;
      const peer = new Peer(peerId, peerOptions());
      this.peer = peer;

      const fail = (err: unknown) => {
        const hint = import.meta.env.DEV
          ? " Start the local Peer server: npm run peer-server"
          : "";
        reject(new Error(`${String(err)}.${hint}`));
      };

      peer.on("open", () => resolve({ code, peerId }));
      peer.on("error", (err) => {
        const msg = String(err);
        if (msg.includes("is taken") || msg.includes("unavailable")) {
          this.peer?.destroy();
          this.initHostPeer().then(resolve).catch(reject);
          return;
        }
        fail(err);
      });
      peer.on("connection", (conn) => this.wireHostConnection(conn));
    });
  }

  private wireHostConnection(conn: DataConnection) {
    const onOpen = () => {
      conn.off("open", onOpen);
      this.dataConnections.set(conn.peer, conn);
      conn.send({
        type: "assigned",
        playerId: conn.peer,
        isHost: false,
      } satisfies HostMessage);
    };

    conn.on("open", onOpen);
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

  private initGuestPeer(playerId: string, code: string, guestName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(playerId, peerOptions());
      this.peer = peer;
      const hostPeerId = `${PEER_PREFIX}${code}`;

      const timer = setTimeout(() => {
        fail(
          new Error(
            import.meta.env.DEV
              ? "Connection timed out. Is the host tab open and is `npm run peer-server` running?"
              : "Connection timed out. Check the code and that the host is still online.",
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      const fail = (err: unknown) => {
        clearTimeout(timer);
        const hint = import.meta.env.DEV
          ? " Run `npm run dev:online` (starts Peer server + Vite) for online local testing."
          : "";
        reject(new Error(`${err instanceof Error ? err.message : String(err)}${hint}`));
      };

      peer.on("open", () => {
        const conn = peer.connect(hostPeerId, { reliable: true });

        conn.on("open", () => {
          clearTimeout(timer);
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

        conn.on("error", (err) => fail(err));
      });

      peer.on("error", (err) => fail(err));
    });
  }
}

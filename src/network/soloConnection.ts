import type { ClientMessage, LobbyState } from "../game/types";
import type { ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

export class SoloConnection implements GameTransport {
  mode = "solo" as const;
  role: ConnectionRole = "host";
  localPlayerId: string | null = null;
  lobbyCode: string | null = "SOLO";

  private handlers: GameTransportHandlers;

  constructor(handlers: GameTransportHandlers) {
    this.handlers = handlers;
  }

  async createLobby(): Promise<{ code: string; playerId: string }> {
    const playerId = `solo-${crypto.randomUUID()}`;
    this.localPlayerId = playerId;
    this.handlers.onAssigned(playerId, true);
    return { code: "SOLO", playerId };
  }

  async joinLobby(code: string, guestName: string): Promise<string> {
    void code;
    void guestName;
    throw new Error("Solo mode does not support joining a lobby.");
  }

  send(message: ClientMessage) {
    window.dispatchEvent(
      new CustomEvent("host-message", {
        detail: { senderId: this.localPlayerId, message },
      }),
    );
  }

  broadcastState(state: LobbyState) {
    void state;
  }

  destroy() {
    this.localPlayerId = null;
  }
}

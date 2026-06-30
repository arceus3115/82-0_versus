import type { ClientMessage, LobbyState } from "../game/types";

export type ConnectionRole = "host" | "guest";
export type ConnectionMode = "local" | "online" | "solo";

export interface GameTransportHandlers {
  onState: (state: LobbyState) => void;
  onAssigned: (playerId: string, isHost: boolean) => void;
  onError: (message: string) => void;
  onConnectingStatus?: (message: string) => void;
  onPeerConnected?: (peerId: string) => void;
  onPeerDisconnected?: (peerId: string) => void;
}

export interface GameTransport {
  mode: ConnectionMode;
  role: ConnectionRole | null;
  localPlayerId: string | null;
  lobbyCode: string | null;
  createLobby(): Promise<{ code: string; playerId: string }>;
  joinLobby(code: string, guestName: string): Promise<string>;
  send(message: ClientMessage): void;
  broadcastState(state: LobbyState): void;
  destroy(): void;
}

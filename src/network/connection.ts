import { LocalConnection } from "./localConnection";
import { PeerConnection } from "./peerConnection";
import { SoloConnection } from "./soloConnection";
import type { ConnectionMode, GameTransport, GameTransportHandlers } from "./types";

export type { ConnectionMode, ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

export function createConnection(
  mode: ConnectionMode,
  handlers: GameTransportHandlers,
): GameTransport {
  if (mode === "solo") return new SoloConnection(handlers);
  if (mode === "local") return new LocalConnection(handlers);
  return new PeerConnection(handlers);
}

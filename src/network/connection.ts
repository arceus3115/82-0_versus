import { LocalConnection } from "./localConnection";
import { PeerConnection } from "./peerConnection";
import type { ConnectionMode, GameTransport, GameTransportHandlers } from "./types";

export type { ConnectionMode, ConnectionRole, GameTransport, GameTransportHandlers } from "./types";

export function createConnection(
  mode: ConnectionMode,
  handlers: GameTransportHandlers,
): GameTransport {
  if (mode === "local") return new LocalConnection(handlers);
  return new PeerConnection(handlers);
}

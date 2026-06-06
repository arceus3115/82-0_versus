export interface PeerServerConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

const MISSING_PEER_SERVER_MSG =
  "Online mode needs a PeerJS signaling server. Deploy scripts/peer-server.mjs " +
  "(see README), then set VITE_PEER_HOST (and VITE_PEER_PORT if not 443) in your build env.";

export function getPeerServerConfig(): PeerServerConfig | null {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;

  if (import.meta.env.DEV && !host) {
    return {
      host: "localhost",
      port: Number(import.meta.env.VITE_PEER_PORT ?? 9000),
      path: import.meta.env.VITE_PEER_PATH ?? "/",
      secure: false,
    };
  }

  if (!host?.trim()) return null;

  const secure = import.meta.env.VITE_PEER_SECURE !== "false";
  const port = Number(import.meta.env.VITE_PEER_PORT ?? (secure ? 443 : 80));

  return {
    host: host.trim(),
    port,
    path: import.meta.env.VITE_PEER_PATH ?? "/",
    secure,
  };
}

export function requirePeerServerConfig(): PeerServerConfig {
  const config = getPeerServerConfig();
  if (!config) throw new Error(MISSING_PEER_SERVER_MSG);
  return config;
}

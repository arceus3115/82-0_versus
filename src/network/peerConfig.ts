export interface PeerServerConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

const MISSING_PEER_SERVER_MSG =
  "Online mode needs a PeerJS signaling server. Set VITE_PEER_HOST in GitHub Actions secrets " +
  "(then redeploy), or add public/peer-config.json with your Render hostname. See docs/DEPLOY_RENDER.md.";

let cached: PeerServerConfig | null | undefined;

/** PeerJS requires a non-empty path; empty env vars must fall back to "/". */
function normalizePath(path: string | undefined): string {
  const trimmed = path?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "/";
}

function fromEnv(): PeerServerConfig | null {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;

  if (import.meta.env.DEV && !host?.trim()) {
    return {
      host: "localhost",
      port: Number(import.meta.env.VITE_PEER_PORT || 9000),
      path: normalizePath(import.meta.env.VITE_PEER_PATH),
      secure: false,
    };
  }

  if (!host?.trim()) return null;

  const secure = import.meta.env.VITE_PEER_SECURE !== "false";
  const port = Number(import.meta.env.VITE_PEER_PORT || (secure ? 443 : 80));

  return {
    host: host.trim(),
    port: Number.isFinite(port) ? port : secure ? 443 : 80,
    path: "/",
    secure,
  };
}

function normalizeRaw(raw: Record<string, unknown>): PeerServerConfig | null {
  const host = typeof raw.host === "string" ? raw.host.trim() : "";
  if (!host) return null;

  const secure = raw.secure !== false;
  const port = Number(raw.port ?? (secure ? 443 : 80));

  return {
    host,
    port: Number.isFinite(port) ? port : secure ? 443 : 80,
    path: normalizePath(typeof raw.path === "string" ? raw.path : undefined),
    secure,
  };
}

export async function loadPeerServerConfig(): Promise<PeerServerConfig | null> {
  if (cached !== undefined) return cached;

  const envConfig = fromEnv();
  if (envConfig) {
    cached = envConfig;
    return cached;
  }

  try {
    const url = `${import.meta.env.BASE_URL}peer-config.json`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const raw = (await response.json()) as Record<string, unknown>;
      const fileConfig = normalizeRaw(raw);
      if (fileConfig) {
        cached = fileConfig;
        return cached;
      }
    }
  } catch {
    // fall through
  }

  cached = null;
  return null;
}

export async function requirePeerServerConfig(): Promise<PeerServerConfig> {
  const config = await loadPeerServerConfig();
  if (!config) throw new Error(MISSING_PEER_SERVER_MSG);
  return config;
}

/** Hit the signaling HTTP endpoint so cold hosts (e.g. Render free tier) wake before WebSocket. */
export async function wakeSignalingServer(config: PeerServerConfig): Promise<void> {
  const protocol = config.secure ? "https" : "http";
  const portSuffix =
    config.secure && config.port === 443 ? "" : config.port === 80 ? "" : `:${config.port}`;
  const base = `${protocol}://${config.host}${portSuffix}`;
  const path = config.path === "/" ? "/" : config.path;

  try {
    await fetch(`${base}${path}`, { mode: "no-cors", cache: "no-store" });
  } catch {
    // Render may still spin up even if the browser hides the response.
  }
}

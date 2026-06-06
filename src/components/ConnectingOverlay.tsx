import type { ConnectionMode } from "../network/connection";

interface Props {
  connectionMode: ConnectionMode;
  phase?: "connect" | "sync";
  statusMessage?: string;
}

export function ConnectingOverlay({ connectionMode, phase = "connect", statusMessage }: Props) {
  const isOnline = connectionMode === "online";
  const title = phase === "sync" ? "Syncing lobby" : "Connecting";
  const defaultDetail =
    phase === "sync"
      ? "Pulling the latest room state…"
      : isOnline
        ? "First connect after idle can take up to a minute while the server wakes."
        : "Opening your local lobby channel…";
  const detail = statusMessage ?? defaultDetail;

  return (
    <div className="connecting-overlay" role="status" aria-live="polite">
      <div className="connecting-flash" aria-hidden />
      <div className="connecting-card">
        <div className="connecting-visual" aria-hidden>
          <svg className="connecting-court" viewBox="0 0 120 120" fill="none">
            <circle className="connecting-court__ring" cx="60" cy="60" r="54" />
            <circle className="connecting-court__ball" cx="60" cy="60" r="22" />
            <path
              className="connecting-court__seam"
              d="M60 38c-12 0-22 10-22 22s10 22 22 22 22-10 22-22-10-22-22-22zm0 0c12 14 12 30 0 44m0-44c-12 14-12 30 0 44"
            />
          </svg>
          <span className="connecting-pulse connecting-pulse--1" />
          <span className="connecting-pulse connecting-pulse--2" />
        </div>
        <p className="connecting-eyebrow">{isOnline ? "Online" : "Local"}</p>
        <h2 className="connecting-title">{title}</h2>
        <p className="connecting-detail">{detail}</p>
        <div className="connecting-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

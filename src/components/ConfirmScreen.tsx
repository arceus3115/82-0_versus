import { PICKS_PER_PLAYER } from "../game/draft";
import type { LobbyState } from "../game/types";
import { CourtRoster } from "./CourtRoster";

interface Props {
  state: LobbyState;
  playerId: string | null;
  onConfirm: () => void;
  onSwap: (fromIndex: number, toIndex: number) => void;
}

export function ConfirmScreen({ state, playerId, onConfirm, onSwap }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const lineupReady = (me?.team.length ?? 0) === PICKS_PER_PLAYER;
  const isSolo = state.gameMode === "solo";

  return (
    <section className="finalize-screen">
      <div className="surface-panel surface-panel--hero finalize-hero">
        <p className="eyebrow">Draft complete</p>
        <h2>Lock in your lineup</h2>
        <p className="subcopy">
          {isSolo
            ? "Swap positions on your court, then lock in to start the bracket."
            : "Swap positions on your court, then confirm. All players must lock in to start the bracket."}
        </p>
      </div>

      <div className="lineup-split">
        {state.players.map((player) => {
          const isMe = player.id === playerId;
          const canSwap = isMe && !player.confirmed;
          return (
            <article key={player.id} className="lineup-card">
              <header className="lineup-card__header">
                <h3>{player.name}</h3>
                <span className={player.confirmed ? "status-ready" : "status-wait"}>
                  {player.confirmed ? "Locked in" : "Reviewing"}
                </span>
              </header>
              <div className="lineup-card__body">
                <CourtRoster
                  team={player.team}
                  interactive={canSwap}
                  onSwap={canSwap ? onSwap : undefined}
                  hint={canSwap ? "Tap two players to swap positions" : undefined}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="finalize-actions">
        {me && !me.confirmed && (
          <>
            <button
              className="btn btn-primary btn-large"
              disabled={!lineupReady}
              onClick={onConfirm}
            >
              Lock in lineup
            </button>
            {!lineupReady && (
              <p className="waiting-host">Need {PICKS_PER_PLAYER} players to lock in.</p>
            )}
          </>
        )}
        {me?.confirmed && !isSolo && (
          <p className="waiting-host">
            Waiting for {state.players.filter((p) => !p.confirmed).length} player
            {state.players.filter((p) => !p.confirmed).length === 1 ? "" : "s"} to lock in…
          </p>
        )}
      </div>
    </section>
  );
}

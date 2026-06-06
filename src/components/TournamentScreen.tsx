import { getMatch } from "../game/bracket";
import type { LobbyState } from "../game/types";
import { BracketBoard } from "./BracketBoard";
import { PredictedStatlineCompare } from "./PredictedStatline";

interface Props {
  state: LobbyState;
}

export function TournamentScreen({ state }: Props) {
  const tournament = state.tournament;
  if (!tournament) return null;

  const activeMatch = tournament.currentMatchId
    ? getMatch(tournament, tournament.currentMatchId)
    : null;
  const champion = state.players.find((p) => p.id === tournament.championId);
  const showSpotlight =
    activeMatch?.result &&
    activeMatch.status === "complete" &&
    activeMatch.playerAId &&
    activeMatch.playerBId;

  return (
    <section className="screen tournament-screen">
      <div className="surface-panel surface-panel--hero finalize-hero">
        <p className="eyebrow">Single elimination</p>
        <h2>{tournament.championId ? `${champion?.name} wins!` : "Bracket in progress"}</h2>
        {!tournament.championId && <p className="subcopy">Resolving matchups one at a time…</p>}
      </div>

      {showSpotlight && (
        <PredictedStatlineCompare
          lines={activeMatch.result!.predictedStatlines}
          winnerId={activeMatch.result!.winnerId}
          title="Latest result"
        />
      )}

      <BracketBoard state={state} highlightMatchId={tournament.currentMatchId} />
    </section>
  );
}

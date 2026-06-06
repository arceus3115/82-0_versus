import type { CSSProperties } from "react";
import { getMatchesByRound, getRoundLabel } from "../game/bracket";
import type { BracketMatch, LobbyState } from "../game/types";
import { PredictedStatlineCompare } from "./PredictedStatline";

interface Props {
  state: LobbyState;
  highlightMatchId?: string | null;
  title?: string;
}

function playerName(state: LobbyState, id: string | null): string {
  if (!id) return "TBD";
  return state.players.find((p) => p.id === id)?.name ?? "TBD";
}

function getMatchResult(match: BracketMatch, state: LobbyState) {
  if ((match.result?.predictedStatlines.length ?? 0) >= 2) return match.result;
  const fallback = state.result;
  if (!fallback || fallback.predictedStatlines.length < 2) return null;
  const ids = new Set(fallback.predictedStatlines.map((line) => line.playerId));
  if (match.playerAId && match.playerBId && ids.has(match.playerAId) && ids.has(match.playerBId)) {
    return fallback;
  }
  return null;
}

function matchStatusLabel(match: BracketMatch, isHighlighted: boolean): string {
  if (match.status === "bye") return "Bye";
  if (match.status === "complete") return "Complete";
  if (match.status === "ready" && isHighlighted) return "Live";
  if (match.status === "ready") return "Next up";
  return "Upcoming";
}

function BracketMatchCard({
  state,
  match,
  roundLabel,
  isHighlighted,
}: {
  state: LobbyState;
  match: BracketMatch;
  roundLabel: string;
  isHighlighted: boolean;
}) {
  const status = matchStatusLabel(match, isHighlighted);
  const boxScore = getMatchResult(match, state);
  const hasBoxScore = !!boxScore;
  const isBye = match.status === "bye";

  return (
    <article
      className={[
        "bracket-match-card",
        isHighlighted ? "bracket-match-card--active" : "",
        match.status === "complete" ? "bracket-match-card--complete" : "",
        isBye ? "bracket-match-card--bye" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="bracket-match-card__header">
        <span className="bracket-match-card__round">{roundLabel}</span>
        <span
          className={[
            "bracket-match-card__status",
            match.status === "complete" ? "bracket-match-card__status--done" : "",
            isHighlighted ? "bracket-match-card__status--live" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {status}
        </span>
      </header>

      <div className="bracket-match-card__body">
        {hasBoxScore ? (
          <PredictedStatlineCompare
            lines={boxScore!.predictedStatlines}
            winnerId={boxScore!.winnerId}
            embedded
            compact
          />
        ) : isBye ? (
          <div className="bracket-match-card__slots">
            <div className="bracket-match-card__slot bracket-match-card__slot--winner">
              <span className="bracket-match-card__name">{playerName(state, match.playerAId)}</span>
              <span className="bracket-match-card__meta">Advances on bye</span>
            </div>
          </div>
        ) : (
          <div className="bracket-match-card__slots">
            <div
              className={[
                "bracket-match-card__slot",
                match.winnerId === match.playerAId ? "bracket-match-card__slot--winner" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="bracket-match-card__name">{playerName(state, match.playerAId)}</span>
              {!match.playerAId && (
                <span className="bracket-match-card__meta">Waiting for slot</span>
              )}
            </div>
            <div className="bracket-match-card__divider" aria-hidden>
              vs
            </div>
            <div
              className={[
                "bracket-match-card__slot",
                match.winnerId === match.playerBId ? "bracket-match-card__slot--winner" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="bracket-match-card__name">{playerName(state, match.playerBId)}</span>
              {!match.playerBId && (
                <span className="bracket-match-card__meta">Waiting for slot</span>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function BracketBoard({ state, highlightMatchId = null, title = "Bracket" }: Props) {
  const tournament = state.tournament;
  if (!tournament) return null;

  const rounds = getMatchesByRound(tournament);
  const champion = state.players.find((p) => p.id === tournament.championId);

  return (
    <section
      className="surface-panel bracket-panel"
      style={{ "--bracket-rounds": rounds.length } as CSSProperties}
    >
      <div className="surface-panel__header">
        <h3>{title}</h3>
        {champion ? <span className="status-ready">{champion.name} wins</span> : null}
      </div>

      <div className="bracket-board">
        {rounds.map((roundMatches, roundIdx) => {
          const roundLabel = getRoundLabel(roundIdx, rounds.length);
          return (
            <div key={roundLabel} className="bracket-round">
              <h4 className="bracket-round__label">{roundLabel}</h4>
              <div className="bracket-round__matches">
                {roundMatches.map((match) => (
                  <BracketMatchCard
                    key={match.id}
                    state={state}
                    match={match}
                    roundLabel={roundLabel}
                    isHighlighted={match.id === highlightMatchId}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

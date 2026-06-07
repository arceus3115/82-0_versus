import { computePositionFit } from "./positionFit";
import type { SlottedCard } from "./lineupSynergy";

export interface TeamRatings {
  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function computeTeamRatings(lineup: SlottedCard[], synergyOffMult: number): TeamRatings {
  let offSum = 0;
  let defSum = 0;
  let fitDefSum = 0;

  for (const { card, slot } of lineup) {
    const fit = computePositionFit(card, slot);
    offSum += card.PTS * fit.statMults.PTS;

    const defContrib = card.STL + card.BLK * 1.2 + card.TRB * 0.15;
    const avgFitDef = (fit.statMults.STL + fit.statMults.BLK + fit.statMults.TRB) / 3;
    defSum += defContrib * avgFitDef;
    fitDefSum += avgFitDef;
  }

  const avgFitDef = lineup.length > 0 ? fitDefSum / lineup.length : 1;
  const offensiveRating = offSum * synergyOffMult;
  const defensiveRating = defSum * avgFitDef;

  return {
    offensiveRating,
    defensiveRating,
    netRating: offensiveRating - defensiveRating * 0.35,
  };
}

export function computeMatchupFactors(
  ratingsA: TeamRatings,
  ratingsB: TeamRatings,
): { factorA: number; factorB: number } {
  const factorA =
    1 + clamp((ratingsA.offensiveRating - ratingsB.defensiveRating) / 400, -0.06, 0.06);
  const factorB =
    1 + clamp((ratingsB.offensiveRating - ratingsA.defensiveRating) / 400, -0.06, 0.06);
  return { factorA, factorB };
}

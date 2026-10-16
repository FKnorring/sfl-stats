import { ratingMetrics, type RatingInput } from "./player-rating"

export const HLTV_RATING_VERSION = "hltv2-approx-v1"
export const HLTV_RATING_DESCRIPTION =
  "HLTV 2.0 (unofficial approximation): the community-reverse-engineered formula " +
  "from KAST, kills, deaths, assists and ADR per round. Not an official HLTV rating."

export const HLTV_RATING_COEFFICIENTS = {
  kast: 0.0073,
  kpr: 0.3591,
  dpr: -0.5329,
  impact: 0.2372,
  adr: 0.0032,
  intercept: 0.1587,
} as const

export type HltvRatingSummary = {
  rating: number
  version: string
  rounds: number
  kast: number
  kpr: number
  dpr: number
  apr: number
  adr: number
  impact: number
}

export function calculateHltvRating(
  facts: readonly RatingInput[]
): HltvRatingSummary {
  if (!facts.length)
    throw new Error("Cannot rate a player with no participated rounds")
  const rounds = facts.length
  const metrics = facts.map(ratingMetrics)
  const sum = (pick: (fact: RatingInput) => number) =>
    facts.reduce((total, fact) => total + pick(fact), 0)
  const kast =
    (metrics.reduce((total, row) => total + row.consistency, 0) / rounds) * 100
  const kpr = sum((fact) => fact.kills) / rounds
  const dpr = sum((fact) => fact.deaths) / rounds
  const apr = sum((fact) => fact.assists + fact.flashAssists) / rounds
  const adr = sum((fact) => fact.damage) / rounds
  const impact = 2.13 * kpr + 0.42 * apr - 0.41
  const c = HLTV_RATING_COEFFICIENTS
  const rating =
    c.kast * kast +
    c.kpr * kpr +
    c.dpr * dpr +
    c.impact * impact +
    c.adr * adr +
    c.intercept
  if (!Number.isFinite(rating)) throw new Error("Non-finite HLTV rating")
  return {
    rating,
    version: HLTV_RATING_VERSION,
    rounds,
    kast,
    kpr,
    dpr,
    apr,
    adr,
    impact,
  }
}

import type { PlayerRoundFact } from "./demo-rating"

export const RATING_VERSION = "sfl-v1"
export const RATING_DESCRIPTION =
  "SFL Rating v1: a custom, provisional model, not an official HLTV rating. " +
  "Combat 25%, damage 20%, KAST 20%, survival 10%, impact 15%, support 10%. " +
  "1.00 is the round-weighted average of the frozen SFL reference corpus."

// Frozen from 5,374 validated player-rounds in 26 SFL09 demos. Never refresh on ingestion.
export const RATING_REFERENCE = {
  combat: 0.6903609973948641,
  damage: 75.74413844436174,
  consistency: 0.7009676218831411,
  survival: 0.30796427242277635,
  multiKill: 0.22366951991068107,
  opening: 0.10085597320431708,
  clutch: 0.015816896166728694,
  assist: 0.21324897655377745,
  flash: 0.015444733903982136,
  utility: 4.705247487904726,
} as const

export const RATING_WEIGHTS = {
  combat: 0.25,
  damage: 0.2,
  consistency: 0.2,
  survival: 0.1,
  impact: 0.15,
  support: 0.1,
} as const

export type RatingComponents = Record<keyof typeof RATING_WEIGHTS, number>
export type RatingInput = Pick<
  PlayerRoundFact,
  | "kills"
  | "deaths"
  | "assists"
  | "flashAssists"
  | "headshotKills"
  | "damage"
  | "utilityDamage"
  | "survived"
  | "traded"
  | "openingKills"
  | "openingDeaths"
  | "clutchWins"
  | "clutchOpponents"
>
export type PlayerRatingSummary = {
  rating: number
  version: string
  rounds: number
  components: RatingComponents
  kills: number
  deaths: number
  assists: number
  headshotKills: number
  damage: number
  utilityDamage: number
  kast: number
  openingKills: number
  openingDeaths: number
  clutchWins: number
  flashAssists: number
}

export function ratingMetrics(fact: RatingInput) {
  for (const [key, value] of Object.entries(fact)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid rating fact ${key}: ${value}`)
    }
  }
  return {
    combat: fact.kills,
    damage: fact.damage,
    consistency: Number(
      fact.kills > 0 ||
        fact.assists + fact.flashAssists > 0 ||
        fact.survived ||
        fact.traded
    ),
    survival: Number(fact.survived),
    multiKill: Math.max(fact.kills - 1, 0),
    opening: fact.openingKills,
    clutch: fact.clutchWins,
    assist: fact.assists,
    flash: fact.flashAssists,
    utility: fact.utilityDamage,
  }
}

export function calculatePlayerRating(
  facts: readonly RatingInput[]
): PlayerRatingSummary {
  if (!facts.length)
    throw new Error("Cannot rate a player with no participated rounds")
  const metrics = facts.map(ratingMetrics)
  const normalized = (key: keyof typeof RATING_REFERENCE) =>
    metrics.reduce((sum, row) => sum + row[key], 0) /
    facts.length /
    RATING_REFERENCE[key]
  const components: RatingComponents = {
    combat: normalized("combat"),
    damage: normalized("damage"),
    consistency: normalized("consistency"),
    survival: normalized("survival"),
    impact:
      (normalized("multiKill") + normalized("opening") + normalized("clutch")) /
      3,
    support:
      (normalized("assist") + normalized("flash") + normalized("utility")) / 3,
  }
  const total = (key: keyof RatingInput) =>
    facts.reduce((sum, fact) => sum + Number(fact[key]), 0)
  const rating = Object.entries(RATING_WEIGHTS).reduce(
    (sum, [key, weight]) =>
      sum + components[key as keyof RatingComponents] * weight,
    0
  )
  if (!Number.isFinite(rating)) throw new Error("Non-finite SFL rating")
  return {
    rating,
    version: RATING_VERSION,
    rounds: facts.length,
    components,
    kills: total("kills"),
    deaths: total("deaths"),
    assists: total("assists") + total("flashAssists"),
    headshotKills: total("headshotKills"),
    damage: total("damage"),
    utilityDamage: total("utilityDamage"),
    kast: metrics.reduce((sum, row) => sum + row.consistency, 0) / facts.length,
    openingKills: total("openingKills"),
    openingDeaths: total("openingDeaths"),
    clutchWins: total("clutchWins"),
    flashAssists: total("flashAssists"),
  }
}

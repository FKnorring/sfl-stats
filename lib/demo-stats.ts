import { z } from "zod"

// Running-total player props read at the final tick of the demo. Field
// names match demoparser2's parseTicks prop names exactly.
export const STAT_FIELDS = [
  "player_name",
  "player_steamid",
  "team_num",
  "kills_total",
  "deaths_total",
  "assists_total",
  "headshot_kills_total",
  "damage_total",
  "utility_damage_total",
  "enemies_flashed_total",
  "mvps",
  "ace_rounds_total",
  "3k_rounds_total",
  "4k_rounds_total",
  "equipment_value_total",
] as const

// Defensive validation of parseTicks output — the known upstream bug (bot
// players get null user_*/attacker_* fields in some events) and general
// demo weirdness mean we should never trust the native addon's output blindly.
export const tickRowSchema = z.object({
  player_name: z.string().nullish(),
  player_steamid: z.string().nullish(),
  team_num: z.number().nullish(),
  kills_total: z.number().nullish(),
  deaths_total: z.number().nullish(),
  assists_total: z.number().nullish(),
  headshot_kills_total: z.number().nullish(),
  damage_total: z.number().nullish(),
  utility_damage_total: z.number().nullish(),
  enemies_flashed_total: z.number().nullish(),
  mvps: z.number().nullish(),
  ace_rounds_total: z.number().nullish(),
  "3k_rounds_total": z.number().nullish(),
  "4k_rounds_total": z.number().nullish(),
  equipment_value_total: z.number().nullish(),
})

export type TickRow = z.infer<typeof tickRowSchema>

export const roundEndRowSchema = z.object({
  tick: z.number(),
  winner: z.string().nullable(),
})

export type RoundEndRow = z.infer<typeof roundEndRowSchema>

/**
 * Whether the side-agnostic "A" bucket is CT for the round at `roundIndex`
 * (0-based, in winner-decided-round order), given CS2's half-swap schedule —
 * regulation is MR12 (halves swap after round 12, i.e. index 11), overtime
 * is MR3 (sides swap every 3 rounds, alternating which bucket starts CT each
 * OT period). This is the single place encoding that schedule; both
 * reconstructFinalScore below and lib/team-anchoring.ts's stableSideForRound
 * call it so there's exactly one definition of "which half/OT period are we
 * in and who's CT".
 */
export function stableBucketAIsCTForRoundIndex(roundIndex: number): boolean {
  if (roundIndex < 12) return true
  if (roundIndex < 24) return false
  const ot = roundIndex - 24
  const period = Math.floor(ot / 6)
  const firstHalfOfPeriod = ot % 6 < 3
  return period % 2 === 0 ? !firstHalfOfPeriod : firstHalfOfPeriod
}

/**
 * Reconstructs the final score from round_end winners alone (no player/team
 * data needed), by tracking two side-agnostic buckets ("A"/"B") through
 * CS2's half-swap schedule (see stableBucketAIsCTForRoundIndex). Used to
 * decide whether a demo represents a genuinely finished match, independent
 * of whether its players could be resolved to roster teams (see
 * computeTeamScore in scripts/ingest-demos.ts, which needs that resolution
 * and can legitimately return null for a complete match played against a
 * non-roster opponent).
 */
export function reconstructFinalScore(
  rounds: RoundEndRow[]
): { scoreA: number; scoreB: number } | null {
  const decided = rounds.filter((r) => r.winner)
  if (decided.length === 0) return null

  let scoreA = 0
  let scoreB = 0
  for (let i = 0; i < decided.length; i++) {
    const winnerSide = decided[i].winner![0]
    const bucketIsCT = stableBucketAIsCTForRoundIndex(i)
    const bucketAWon =
      (winnerSide === "C" && bucketIsCT) || (winnerSide === "T" && !bucketIsCT)
    if (bucketAWon) scoreA++
    else scoreB++
  }

  return { scoreA, scoreB }
}

/**
 * A match is "finished" once a side has reached 13+ rounds with a 2+ round
 * margin (regulation win, or an overtime win-by-2 after the periods have
 * been played out). Anything short of that — a scrim cut off early, a demo
 * that stops recording mid-game — is treated as a dead artifact, not a real
 * result, and should not be ingested.
 */
export function isMatchComplete(rounds: RoundEndRow[]): boolean {
  const score = reconstructFinalScore(rounds)
  if (!score) return false
  const { scoreA, scoreB } = score
  const max = Math.max(scoreA, scoreB)
  const margin = Math.abs(scoreA - scoreB)
  return max >= 13 && margin >= 2
}

export type DerivedPlayerStats = {
  steamid64: string
  inGameName: string
  teamName: string | null
  kills: number
  deaths: number
  assists: number
  headshotKills: number
  damageTotal: number
  utilityDamageTotal: number | null
  enemiesFlashedTotal: number | null
  mvps: number | null
  aceRounds: number | null
  rounds3k: number | null
  rounds4k: number | null
  equipmentValueTotal: number | null
  adr: number | null
  hsPct: number | null
}

/** Derive ADR/HS% and normalize a validated tick row into a flat stats
 * record. Returns null for rows with no steamid (bots, or the upstream
 * null-field bug) since they can't be attributed to a player. */
export function deriveStats(
  row: TickRow,
  totalRounds: number
): DerivedPlayerStats | null {
  if (!row.player_steamid || !row.player_name) return null

  const kills = row.kills_total ?? 0
  const damageTotal = row.damage_total ?? 0
  const headshotKills = row.headshot_kills_total ?? 0

  return {
    steamid64: row.player_steamid,
    inGameName: row.player_name,
    teamName: row.team_num != null ? String(row.team_num) : null,
    kills,
    deaths: row.deaths_total ?? 0,
    assists: row.assists_total ?? 0,
    headshotKills,
    damageTotal,
    utilityDamageTotal: row.utility_damage_total ?? null,
    enemiesFlashedTotal: row.enemies_flashed_total ?? null,
    mvps: row.mvps ?? null,
    aceRounds: row.ace_rounds_total ?? null,
    rounds3k: row["3k_rounds_total"] ?? null,
    rounds4k: row["4k_rounds_total"] ?? null,
    equipmentValueTotal: row.equipment_value_total ?? null,
    adr: totalRounds > 0 ? damageTotal / totalRounds : null,
    hsPct: kills > 0 ? headshotKills / kills : null,
  }
}

// player_death rows carry attacker_*/user_* (victim) fields. Everything but
// the victim's steamid is nullable: world deaths have no attacker, and the
// bot null-field bug can blank any of them.
export const killRowSchema = z.object({
  tick: z.number(),
  total_rounds_played: z.number().nullish(),
  attacker_steamid: z.string().nullish(),
  attacker_X: z.number().nullish(),
  attacker_Y: z.number().nullish(),
  attacker_team_name: z.string().nullish(),
  user_steamid: z.string().nullish(),
  user_X: z.number().nullish(),
  user_Y: z.number().nullish(),
  user_team_name: z.string().nullish(),
  weapon: z.string().nullish(),
  headshot: z.boolean().nullish(),
})

export type KillRow = z.infer<typeof killRowSchema>

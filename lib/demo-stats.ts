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

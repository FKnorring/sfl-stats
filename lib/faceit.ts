import Database from "better-sqlite3"
import { DB_PATH } from "@/lib/db-path"

// Read-only connection, same convention as lib/db.ts — all writes happen
// exclusively in scripts/faceit-sync.ts via scripts/db-writable.ts.
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

const DEFAULT_RECENT_DAYS = 7

export type FaceitPlayerSummary = {
  steamid64: string
  faceitNickname: string
  elo: number | null
  skillLevel: number | null
  matchesRecent: number
  avgKd: number | null
  avgAdr: number | null
  avgEloRecent: number | null
}

/**
 * Current Faceit snapshot + recent-window aggregates for every player we
 * have Faceit data for, keyed by steamid64 for cheap lookup from the
 * leaderboard. `avgEloRecent` is almost always null today — Faceit's match
 * stats endpoint doesn't expose elo-at-time-of-match (see faceit-client.ts),
 * so it falls back to the player's current elo at the call site instead.
 */
export function getFaceitPlayerStats(
  days: number = DEFAULT_RECENT_DAYS
): Map<string, FaceitPlayerSummary> {
  const rows = db
    .prepare(
      `
      SELECT
        fp.steamid64 AS steamid64,
        fp.nickname AS faceitNickname,
        fp.elo AS elo,
        fp.skill_level AS skillLevel,
        COUNT(fms.id) AS matchesRecent,
        AVG(fms.kd_ratio) AS avgKd,
        AVG(fms.adr) AS avgAdr,
        AVG(fms.elo_at_match) AS avgEloRecent
      FROM faceit_players fp
      LEFT JOIN faceit_match_stats fms
        ON fms.steamid64 = fp.steamid64
        AND datetime(fms.played_at) >= datetime('now', @daysOffset)
      GROUP BY fp.steamid64
      `
    )
    .all({ daysOffset: `-${days} days` }) as FaceitPlayerSummary[]

  return new Map(rows.map((r) => [r.steamid64, r]))
}

export type FaceitTeamSummary = {
  playersWithFaceit: number
  avgElo: number | null
  avgKd: number | null
  avgAdr: number | null
  matchesRecent: number
}

/**
 * Per-team Faceit averages (current elo + recent-window K/D/ADR), keyed by
 * team id, for players on that team's roster with a confirmed steamid and
 * Faceit data. Mirrors getTeamStandings' join shape in lib/db.ts.
 */
export function getFaceitTeamStats(
  days: number = DEFAULT_RECENT_DAYS
): Map<number, FaceitTeamSummary> {
  const rows = db
    .prepare(
      `
      SELECT
        t.id AS teamId,
        COUNT(DISTINCT fp.steamid64) AS playersWithFaceit,
        AVG(fp.elo) AS avgElo,
        AVG(fms.kd_ratio) AS avgKd,
        AVG(fms.adr) AS avgAdr,
        COUNT(fms.id) AS matchesRecent
      FROM teams t
      JOIN roster_entries re ON re.team_id = t.id
        AND re.match_status IN ('manual', 'auto_high')
      JOIN faceit_players fp ON fp.steamid64 = re.matched_steamid64
      LEFT JOIN faceit_match_stats fms
        ON fms.steamid64 = fp.steamid64
        AND datetime(fms.played_at) >= datetime('now', @daysOffset)
      GROUP BY t.id
      `
    )
    .all({ daysOffset: `-${days} days` }) as (FaceitTeamSummary & {
    teamId: number
  })[]

  return new Map(rows.map(({ teamId, ...rest }) => [teamId, rest]))
}

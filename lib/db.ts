import Database from "better-sqlite3"
import { DB_PATH } from "@/lib/db-path"

// Read-only connection used by the app. All writes happen exclusively in
// the CLI scripts (scrape-roster, ingest-demos) via scripts/db-writable.ts,
// so the web server never mutates data/sfl.db.
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

// Seasons before 9 are excluded everywhere in the app — the roster scrape/
// matching pipeline wasn't reliable before then, so that data is treated as
// not present at all (not just hidden behind the default filter).
const MIN_SEASON = 9
const SEASON_CUTOFF_SQL = `CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) >= ${MIN_SEASON}`

export type LeaderboardStat =
  "kills" | "deaths" | "adr" | "hs_pct" | "mvps" | "assists"

const STAT_COLUMNS: Record<LeaderboardStat, string> = {
  kills: "SUM(pms.kills)",
  deaths: "SUM(pms.deaths)",
  adr: "AVG(pms.adr)",
  hs_pct: "AVG(pms.hs_pct)",
  mvps: "SUM(pms.mvps)",
  assists: "SUM(pms.assists)",
}

export type LeaderboardRow = {
  steamid64: string
  inGameName: string
  teamName: string | null
  season: string | null
  division: string | null
  matchStatus: string | null
  matchesPlayed: number
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number
  statValue: number
}

export type LeaderboardFilters = {
  stat: LeaderboardStat
  division?: string
  team?: string
  season?: string
}

/**
 * Most recent season present in the scraped roster ("SFL Säsong 9" > "...8"),
 * used as the default scope for the leaderboard/standings. Without this,
 * a player who's played several seasons under the same nickname gets
 * matched to one roster_entries row per season and shows up once per
 * season in aggregates — scoping to one season at a time avoids that.
 */
export function getCurrentSeason(): string | null {
  const rows = db
    .prepare(
      `SELECT DISTINCT t.season AS season FROM teams t WHERE ${SEASON_CUTOFF_SQL}`
    )
    .all() as { season: string }[]
  if (rows.length === 0) return null
  return rows
    .map((r) => r.season)
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10)
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)
      return nb - na
    })[0]
}

export function getSeasons(): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT t.season AS season FROM teams t WHERE ${SEASON_CUTOFF_SQL}`
      )
      .all() as { season: string }[]
  )
    .map((r) => r.season)
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10)
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)
      return nb - na
    })
}

/**
 * Player leaderboard aggregated across every ingested demo. Attribution to
 * a real player/team comes from roster_entries.matched_steamid64 — rows
 * with no roster match still show up (keyed by in-game name) so unmatched
 * players aren't silently dropped from the board.
 */
export function getLeaderboard(filters: LeaderboardFilters): LeaderboardRow[] {
  const statExpr = STAT_COLUMNS[filters.stat]

  // Unmatched players (no roster_entries row, so t.season is NULL via the
  // LEFT JOIN) still belong on the board — only exclude rows that are
  // explicitly tied to a pre-season-9 team.
  const conditions: string[] = [`(t.season IS NULL OR ${SEASON_CUTOFF_SQL})`]
  const params: Record<string, string> = {}
  if (filters.season) {
    conditions.push("t.season = @season")
    params.season = filters.season
  }
  if (filters.division) {
    conditions.push("t.division = @division")
    params.division = filters.division
  }
  if (filters.team) {
    conditions.push("t.name = @team")
    params.team = filters.team
  }
  const where = `WHERE ${conditions.join(" AND ")}`

  const rows = db
    .prepare(
      `
      SELECT
        p.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        re.match_status AS matchStatus,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed,
        SUM(pms.kills) AS kills,
        SUM(pms.deaths) AS deaths,
        SUM(pms.assists) AS assists,
        AVG(pms.adr) AS adr,
        AVG(pms.hs_pct) AS hsPct,
        SUM(pms.mvps) AS mvps,
        ${statExpr} AS statValue
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      LEFT JOIN roster_entries re ON re.matched_steamid64 = p.steamid64
      LEFT JOIN teams t ON t.id = re.team_id
      ${where}
      GROUP BY p.steamid64, t.id
      ORDER BY statValue DESC
      `
    )
    .all(params) as LeaderboardRow[]

  return rows
}

export type TeamStandingRow = {
  teamId: number
  teamName: string
  season: string
  division: string
  rosterSize: number
  matchedPlayers: number
  totalKills: number
  totalDeaths: number
  avgAdr: number | null
  matchesPlayed: number
}

/**
 * Team-level standings derived from matched roster players' demo stats
 * (no Toornament W/D/L scrape in this first pass — see plan notes).
 */
export function getTeamStandings(
  filters: {
    season?: string
    division?: string
  } = {}
): TeamStandingRow[] {
  const conditions: string[] = [SEASON_CUTOFF_SQL]
  const params: Record<string, string> = {}
  if (filters.season) {
    conditions.push("t.season = @season")
    params.season = filters.season
  }
  if (filters.division) {
    conditions.push("t.division = @division")
    params.division = filters.division
  }
  const where = `WHERE ${conditions.join(" AND ")}`

  return db
    .prepare(
      `
      SELECT
        t.id AS teamId,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        COUNT(DISTINCT re.id) AS rosterSize,
        COUNT(DISTINCT re.matched_steamid64) AS matchedPlayers,
        COALESCE(SUM(pms.kills), 0) AS totalKills,
        COALESCE(SUM(pms.deaths), 0) AS totalDeaths,
        AVG(pms.adr) AS avgAdr,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed
      FROM teams t
      LEFT JOIN roster_entries re ON re.team_id = t.id
      LEFT JOIN player_match_stats pms ON pms.steamid64 = re.matched_steamid64
      ${where}
      GROUP BY t.id
      ORDER BY totalKills DESC
      `
    )
    .all(params) as TeamStandingRow[]
}

export type UnmatchedRosterEntry = {
  id: number
  nickname: string
  realName: string | null
  teamName: string
  season: string
  division: string
  matchStatus: string
  matchConfidence: number | null
}

/** Roster entries still needing manual review (feeds data/player-overrides.json). */
export function getUnmatchedRosterEntries(): UnmatchedRosterEntry[] {
  return db
    .prepare(
      `
      SELECT
        re.id AS id,
        re.nickname AS nickname,
        re.real_name AS realName,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        re.match_status AS matchStatus,
        re.match_confidence AS matchConfidence
      FROM roster_entries re
      JOIN teams t ON t.id = re.team_id
      WHERE re.match_status NOT IN ('manual', 'auto_high')
        AND ${SEASON_CUTOFF_SQL}
      ORDER BY re.match_status, t.season DESC, t.division, t.name
      `
    )
    .all() as UnmatchedRosterEntry[]
}

export function getDivisions(): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT division FROM teams t WHERE ${SEASON_CUTOFF_SQL} ORDER BY division`
      )
      .all() as {
      division: string
    }[]
  ).map((r) => r.division)
}

export function getTeams(): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT name FROM teams t WHERE ${SEASON_CUTOFF_SQL} ORDER BY name`
      )
      .all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

export type TeamMeta = {
  teamId: number
  teamName: string
  season: string
  division: string
}

/** Looks up a single team-season row by id, for the compare page's headers. */
export function getTeamMeta(teamId: number): TeamMeta | null {
  const row = db
    .prepare(
      `SELECT id AS teamId, name AS teamName, season, division FROM teams WHERE id = @teamId`
    )
    .get({ teamId }) as TeamMeta | undefined
  return row ?? null
}

export type TeamRosterPlayerRow = {
  rosterEntryId: number
  steamid64: string | null
  nickname: string
  inGameName: string | null
  matchStatus: string
  matchesPlayed: number
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number
}

/**
 * Full roster for one team-season, including unmatched entries (no demo
 * stats, shown as "—" at the call site) — same reasoning as
 * getTeamStandings' rosterSize/matchedPlayers split, but per-player instead
 * of aggregated, for the team-compare view.
 */
export function getTeamRoster(teamId: number): TeamRosterPlayerRow[] {
  return db
    .prepare(
      `
      SELECT
        re.id AS rosterEntryId,
        re.matched_steamid64 AS steamid64,
        re.nickname AS nickname,
        p.latest_ingame_name AS inGameName,
        re.match_status AS matchStatus,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed,
        COALESCE(SUM(pms.kills), 0) AS kills,
        COALESCE(SUM(pms.deaths), 0) AS deaths,
        COALESCE(SUM(pms.assists), 0) AS assists,
        AVG(pms.adr) AS adr,
        AVG(pms.hs_pct) AS hsPct,
        COALESCE(SUM(pms.mvps), 0) AS mvps
      FROM roster_entries re
      LEFT JOIN players p ON p.steamid64 = re.matched_steamid64
      LEFT JOIN player_match_stats pms ON pms.steamid64 = re.matched_steamid64
      WHERE re.team_id = @teamId
      GROUP BY re.id
      ORDER BY kills DESC
      `
    )
    .all({ teamId }) as TeamRosterPlayerRow[]
}

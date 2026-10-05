import Database from "better-sqlite3"
import { DB_PATH } from "@/lib/db-path"
import { MATCHED_TEAM_PLAYERS_CTE, ROSTER_WITH_TEAM_CTE } from "@/lib/roster-sql"

// Read-only connection used by the app. All writes happen exclusively in
// the CLI scripts (scrape-roster, ingest-demos) via scripts/db-writable.ts,
// so the web server never mutates data/sfl.db.
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

// Seasons before 9 are excluded everywhere in the app — the roster scrape/
// matching pipeline wasn't reliable before then, so that data is treated as
// not present at all (not just hidden behind the default filter).
const MIN_SEASON = 9
const seasonCutoffSql = (teamAlias: string) =>
  `CAST(TRIM(REPLACE(${teamAlias}.season, 'SFL Säsong', '')) AS INTEGER) >= ${MIN_SEASON}`
const TEAM_SEASON_CUTOFF_SQL = seasonCutoffSql("t")

export type LeaderboardStat =
  "kills" | "deaths" | "adr" | "hs_pct" | "mvps" | "assists"

const STAT_COLUMNS: Record<LeaderboardStat, string> = {
  kills: "pds.kills",
  deaths: "pds.deaths",
  adr: "pds.adr",
  hs_pct: "pds.hsPct",
  mvps: "pds.mvps",
  assists: "pds.assists",
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
      `SELECT DISTINCT t.season AS season FROM teams t WHERE ${TEAM_SEASON_CUTOFF_SQL}`
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
        `SELECT DISTINCT t.season AS season FROM teams t WHERE ${TEAM_SEASON_CUTOFF_SQL}`
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
  const conditions: string[] = [`(pts.season IS NULL OR ${seasonCutoffSql("pts")})`]
  const params: Record<string, string> = {}
  if (filters.season) {
    conditions.push("pts.season = @season")
    params.season = filters.season
  }
  if (filters.division) {
    conditions.push("pts.division = @division")
    params.division = filters.division
  }
  if (filters.team) {
    conditions.push("pts.teamName = @team")
    params.team = filters.team
  }
  const where = `WHERE ${conditions.join(" AND ")}`

  const rows = db
    .prepare(
      `
      WITH
        ${ROSTER_WITH_TEAM_CTE},
        player_team_scope AS (
          SELECT
            roster_with_team.steamid64 AS steamid64,
            roster_with_team.teamId AS teamId,
            roster_with_team.teamName AS teamName,
            roster_with_team.season AS season,
            roster_with_team.division AS division,
            MIN(roster_with_team.matchStatus) AS matchStatus
          FROM roster_with_team
          WHERE roster_with_team.steamid64 IS NOT NULL
          GROUP BY roster_with_team.steamid64, roster_with_team.teamId
        ),
        player_demo_stats AS (
          SELECT
            pms.steamid64 AS steamid64,
            COUNT(DISTINCT pms.match_id) AS matchesPlayed,
            SUM(pms.kills) AS kills,
            SUM(pms.deaths) AS deaths,
            SUM(pms.assists) AS assists,
            AVG(pms.adr) AS adr,
            AVG(pms.hs_pct) AS hsPct,
            SUM(pms.mvps) AS mvps
          FROM player_match_stats pms
          GROUP BY pms.steamid64
        )
      SELECT
        p.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        pts.teamName AS teamName,
        pts.season AS season,
        pts.division AS division,
        pts.matchStatus AS matchStatus,
        pds.matchesPlayed AS matchesPlayed,
        pds.kills AS kills,
        pds.deaths AS deaths,
        pds.assists AS assists,
        pds.adr AS adr,
        pds.hsPct AS hsPct,
        pds.mvps AS mvps,
        ${statExpr} AS statValue
      FROM player_demo_stats pds
      JOIN players p ON p.steamid64 = pds.steamid64
      LEFT JOIN player_team_scope pts ON pts.steamid64 = p.steamid64
      ${where}
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
  const conditions: string[] = [TEAM_SEASON_CUTOFF_SQL]
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
      WITH
        ${ROSTER_WITH_TEAM_CTE},
        roster_counts AS (
          SELECT
            roster_with_team.teamId AS teamId,
            COUNT(DISTINCT roster_with_team.rosterEntryId) AS rosterSize,
            COUNT(DISTINCT roster_with_team.steamid64) AS matchedPlayers
          FROM roster_with_team
          GROUP BY roster_with_team.teamId
        ),
        ${MATCHED_TEAM_PLAYERS_CTE},
        team_demo_stats AS (
          SELECT
            matched_team_players.teamId AS teamId,
            COALESCE(SUM(pms.kills), 0) AS totalKills,
            COALESCE(SUM(pms.deaths), 0) AS totalDeaths,
            AVG(pms.adr) AS avgAdr,
            COUNT(DISTINCT pms.match_id) AS matchesPlayed
          FROM matched_team_players
          LEFT JOIN player_match_stats pms ON pms.steamid64 = matched_team_players.steamid64
          GROUP BY matched_team_players.teamId
        )
      SELECT
        t.id AS teamId,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        COALESCE(rc.rosterSize, 0) AS rosterSize,
        COALESCE(rc.matchedPlayers, 0) AS matchedPlayers,
        COALESCE(tds.totalKills, 0) AS totalKills,
        COALESCE(tds.totalDeaths, 0) AS totalDeaths,
        tds.avgAdr AS avgAdr,
        COALESCE(tds.matchesPlayed, 0) AS matchesPlayed
      FROM teams t
      LEFT JOIN roster_counts rc ON rc.teamId = t.id
      LEFT JOIN team_demo_stats tds ON tds.teamId = t.id
      ${where}
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
        AND ${TEAM_SEASON_CUTOFF_SQL}
      ORDER BY re.match_status, t.season DESC, t.division, t.name
      `
    )
    .all() as UnmatchedRosterEntry[]
}

export function getDivisions(): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT division FROM teams t WHERE ${TEAM_SEASON_CUTOFF_SQL} ORDER BY division`
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
        `SELECT DISTINCT name FROM teams t WHERE ${TEAM_SEASON_CUTOFF_SQL} ORDER BY name`
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
      WITH ${ROSTER_WITH_TEAM_CTE}
      SELECT
        roster_with_team.rosterEntryId AS rosterEntryId,
        roster_with_team.steamid64 AS steamid64,
        roster_with_team.nickname AS nickname,
        p.latest_ingame_name AS inGameName,
        roster_with_team.matchStatus AS matchStatus,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed,
        COALESCE(SUM(pms.kills), 0) AS kills,
        COALESCE(SUM(pms.deaths), 0) AS deaths,
        COALESCE(SUM(pms.assists), 0) AS assists,
        AVG(pms.adr) AS adr,
        AVG(pms.hs_pct) AS hsPct,
        COALESCE(SUM(pms.mvps), 0) AS mvps
      FROM roster_with_team
      LEFT JOIN players p ON p.steamid64 = roster_with_team.steamid64
      LEFT JOIN player_match_stats pms ON pms.steamid64 = roster_with_team.steamid64
      WHERE roster_with_team.teamId = @teamId
      GROUP BY roster_with_team.rosterEntryId
      ORDER BY kills DESC
      `
    )
    .all({ teamId }) as TeamRosterPlayerRow[]
}

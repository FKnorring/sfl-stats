import { sql } from "drizzle-orm"
import { db } from "@/lib/db/client"

// Read-only Drizzle instance used by the app. All writes happen exclusively
// in the CLI scripts (scrape-roster, ingest-demos) via
// scripts/write-db.ts / lib/db/client.ts's openWritableDb, so the web
// server never mutates the database — see
// docs/adr/0002-public-app-is-read-only.md.

// Seasons before 9 are excluded everywhere in the app — the roster scrape/
// matching pipeline wasn't reliable before then, so that data is treated as
// not present at all (not just hidden behind the default filter).
const MIN_SEASON = 9
const SEASON_CUTOFF_SQL = sql.raw(
  `CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) >= ${MIN_SEASON}`
)

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
export async function getCurrentSeason(): Promise<string | null> {
  const rows = (
    await db.all(
      sql`SELECT DISTINCT t.season AS season FROM teams t WHERE ${SEASON_CUTOFF_SQL}`
    )
  ) as { season: string }[]
  if (rows.length === 0) return null
  return rows
    .map((r) => r.season)
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10)
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)
      return nb - na
    })[0]
}

export async function getSeasons(): Promise<string[]> {
  const rows = (await db.all(
    sql`SELECT DISTINCT t.season AS season FROM teams t WHERE ${SEASON_CUTOFF_SQL}`
  )) as { season: string }[]
  return rows
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
export async function getLeaderboard(
  filters: LeaderboardFilters
): Promise<LeaderboardRow[]> {
  const statExpr = sql.raw(STAT_COLUMNS[filters.stat])

  // Unmatched players (no roster_entries row, so t.season is NULL via the
  // LEFT JOIN) still belong on the board — only exclude rows that are
  // explicitly tied to a pre-season-9 team.
  const conditions = [sql`(t.season IS NULL OR ${SEASON_CUTOFF_SQL})`]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
  if (filters.division)
    conditions.push(sql`t.division = ${filters.division}`)
  if (filters.team) conditions.push(sql`t.name = ${filters.team}`)
  const where = sql.join(
    [sql`WHERE `, sql.join(conditions, sql` AND `)],
    sql``
  )

  return (await db.all(
    sql`
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
  )) as LeaderboardRow[]
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
export async function getTeamStandings(
  filters: {
    season?: string
    division?: string
  } = {}
): Promise<TeamStandingRow[]> {
  const conditions = [SEASON_CUTOFF_SQL]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
  if (filters.division)
    conditions.push(sql`t.division = ${filters.division}`)
  const where = sql.join(
    [sql`WHERE `, sql.join(conditions, sql` AND `)],
    sql``
  )

  return (await db.all(
    sql`
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
  )) as TeamStandingRow[]
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
export async function getUnmatchedRosterEntries(): Promise<
  UnmatchedRosterEntry[]
> {
  return (await db.all(
    sql`
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
  )) as UnmatchedRosterEntry[]
}

export async function getDivisions(): Promise<string[]> {
  const rows = (await db.all(
    sql`SELECT DISTINCT division FROM teams t WHERE ${SEASON_CUTOFF_SQL} ORDER BY division`
  )) as { division: string }[]
  return rows.map((r) => r.division)
}

export async function getTeams(): Promise<string[]> {
  const rows = (await db.all(
    sql`SELECT DISTINCT name FROM teams t WHERE ${SEASON_CUTOFF_SQL} ORDER BY name`
  )) as { name: string }[]
  return rows.map((r) => r.name)
}

export type TeamMeta = {
  teamId: number
  teamName: string
  season: string
  division: string
}

/** Looks up a single team-season row by id, for the compare page's headers. */
export async function getTeamMeta(teamId: number): Promise<TeamMeta | null> {
  const rows = (await db.all(
    sql`SELECT id AS teamId, name AS teamName, season, division FROM teams WHERE id = ${teamId}`
  )) as TeamMeta[]
  return rows[0] ?? null
}

/**
 * Looks up a team-season row by name, for the single-team roster page.
 * A team name alone doesn't uniquely identify a row (unique key is
 * name+season+division), so this defaults to `season` when given, otherwise
 * falls back to whichever of that team's seasons sorts highest — same
 * "most recent season" convention as getCurrentSeason/getTeamStandings.
 */
export async function getTeamByName(
  name: string,
  season?: string
): Promise<TeamMeta | null> {
  const rows = (await db.all(
    sql`SELECT id AS teamId, name AS teamName, season, division FROM teams WHERE name = ${name}`
  )) as TeamMeta[]
  if (rows.length === 0) return null
  if (season) return rows.find((r) => r.season === season) ?? null
  return rows.sort((a, b) => {
    const na = parseInt(a.season.match(/(\d+)/)?.[1] ?? "0", 10)
    const nb = parseInt(b.season.match(/(\d+)/)?.[1] ?? "0", 10)
    return nb - na
  })[0]
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
export async function getTeamRoster(
  teamId: number
): Promise<TeamRosterPlayerRow[]> {
  return (await db.all(
    sql`
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
      WHERE re.team_id = ${teamId}
      GROUP BY re.id
      ORDER BY kills DESC
      `
  )) as TeamRosterPlayerRow[]
}

export type FutureOpponent = {
  matchId: string
  opponentName: string
  opponentTeamId: number | null
  scheduledAt: string | null
  roundLabel: string | null
}

/**
 * Upcoming (not-yet-played) matches for one team, scraped from Toornament's
 * schedule widget by scripts/scrape-schedule.ts. Each row names whichever
 * side isn't `teamId` as the opponent — picked in JS since team_a/team_b
 * are just "side 1"/"side 2" from the scrape, not home/away.
 */
export async function getFutureOpponents(
  teamId: number
): Promise<FutureOpponent[]> {
  const rows = (await db.all(
    sql`
      SELECT
        toornament_match_id AS matchId,
        scheduled_at AS scheduledAt,
        round_label AS roundLabel,
        team_a_id AS teamAId,
        team_b_id AS teamBId,
        team_a_name_raw AS teamAName,
        team_b_name_raw AS teamBName
      FROM toornament_matches
      WHERE status = 'pending' AND (team_a_id = ${teamId} OR team_b_id = ${teamId})
      ORDER BY scheduled_at ASC
      `
  )) as {
    matchId: string
    scheduledAt: string | null
    roundLabel: string | null
    teamAId: number | null
    teamBId: number | null
    teamAName: string
    teamBName: string
  }[]

  return rows.map((r) => {
    const isTeamA = r.teamAId === teamId
    return {
      matchId: r.matchId,
      opponentName: isTeamA ? r.teamBName : r.teamAName,
      opponentTeamId: isTeamA ? r.teamBId : r.teamAId,
      scheduledAt: r.scheduledAt,
      roundLabel: r.roundLabel,
    }
  })
}

export type TeamMapStat = {
  mapName: string
  matchesPlayed: number
  wins: number
  losses: number
  winRate: number | null
}

/**
 * Map pick counts + win/loss across this team's ingested demos. Win/loss
 * only counts matches where ingest-demos.ts resolved both sides to a known
 * team (matches.team_a_id/team_b_id) — matchesPlayed still includes
 * unresolved ones (same "count everything, win/loss stays 0 if unknown"
 * convention as getTeamStandings' rosterSize/matchedPlayers split).
 */
export async function getTeamMapStats(
  teamId: number
): Promise<TeamMapStat[]> {
  const rows = (await db.all(
    sql`
      SELECT
        map_name AS mapName,
        COUNT(*) AS matchesPlayed,
        COALESCE(SUM(CASE
          WHEN team_a_id = ${teamId} AND team_a_score > team_b_score THEN 1
          WHEN team_b_id = ${teamId} AND team_b_score > team_a_score THEN 1
          ELSE 0
        END), 0) AS wins,
        COALESCE(SUM(CASE
          WHEN team_a_id = ${teamId} AND team_a_score < team_b_score THEN 1
          WHEN team_b_id = ${teamId} AND team_b_score < team_a_score THEN 1
          ELSE 0
        END), 0) AS losses
      FROM (
        SELECT DISTINCT m.id, m.map_name, m.team_a_id, m.team_a_score, m.team_b_id, m.team_b_score
        FROM roster_entries re
        JOIN player_match_stats pms ON pms.steamid64 = re.matched_steamid64
        JOIN matches m ON m.id = pms.match_id
        WHERE re.team_id = ${teamId} AND m.map_name IS NOT NULL
      )
      GROUP BY map_name
      ORDER BY matchesPlayed DESC
      `
  )) as Omit<TeamMapStat, "winRate">[]

  return rows.map((r) => ({
    ...r,
    winRate: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : null,
  }))
}

export type RecentResult = {
  matchId: string
  opponentName: string
  opponentTeamId: number | null
  scheduledAt: string | null
  teamScore: number
  opponentScore: number
  result: "win" | "loss"
}

/** Most recent completed Toornament matches for one team, newest first. */
export async function getRecentResults(
  teamId: number,
  limit = 5
): Promise<RecentResult[]> {
  const rows = (await db.all(
    sql`
      SELECT
        toornament_match_id AS matchId,
        scheduled_at AS scheduledAt,
        team_a_id AS teamAId,
        team_b_id AS teamBId,
        team_a_name_raw AS teamAName,
        team_b_name_raw AS teamBName,
        team_a_score AS teamAScore,
        team_b_score AS teamBScore
      FROM toornament_matches
      WHERE status = 'completed'
        AND (team_a_id = ${teamId} OR team_b_id = ${teamId})
        AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
      ORDER BY scheduled_at DESC
      LIMIT ${limit}
      `
  )) as {
    matchId: string
    scheduledAt: string | null
    teamAId: number | null
    teamBId: number | null
    teamAName: string
    teamBName: string
    teamAScore: number
    teamBScore: number
  }[]

  return rows.map((r) => {
    const isTeamA = r.teamAId === teamId
    const teamScore = isTeamA ? r.teamAScore : r.teamBScore
    const opponentScore = isTeamA ? r.teamBScore : r.teamAScore
    return {
      matchId: r.matchId,
      opponentName: isTeamA ? r.teamBName : r.teamAName,
      opponentTeamId: isTeamA ? r.teamBId : r.teamAId,
      scheduledAt: r.scheduledAt,
      teamScore,
      opponentScore,
      result: teamScore > opponentScore ? "win" : "loss",
    }
  })
}

export type MatchDetail = {
  matchId: string
  scheduledAt: string | null
  roundLabel: string | null
  status: "pending" | "running" | "completed"
  teamAName: string
  teamBName: string
  teamAId: number | null
  teamBId: number | null
  teamAScore: number | null
  teamBScore: number | null
}

/** A single Toornament match by its toornament_match_id, for the match detail page. */
export function getMatchById(matchId: string): MatchDetail | null {
  const row = db
    .prepare(
      `
      SELECT
        toornament_match_id AS matchId,
        scheduled_at AS scheduledAt,
        round_label AS roundLabel,
        status,
        team_a_name_raw AS teamAName,
        team_b_name_raw AS teamBName,
        team_a_id AS teamAId,
        team_b_id AS teamBId,
        team_a_score AS teamAScore,
        team_b_score AS teamBScore
      FROM toornament_matches
      WHERE toornament_match_id = @matchId
      `
    )
    .get({ matchId }) as MatchDetail | undefined
  return row ?? null
}

import { sql } from "drizzle-orm"
import { db, type AppDb } from "@/lib/db/client"
import { MATCH_THRESHOLD_LOW, scoreSimilarity } from "@/lib/matching"
import { teamDemoScope } from "@/lib/follow-stats"
import { matchDateTime, type DemoMatchRow, type MatchTeam } from "@/lib/matches"
import {
  ratingAverageSql,
  ratedGamesSql,
  getMatchRatingSummaries,
} from "@/lib/rating-db"
import { RATING_VERSION } from "@/lib/player-rating"
import { resolveOfficialTeam } from "@/lib/toornament-standings"

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
  | "matches"
  | "kills"
  | "deaths"
  | "adr"
  | "hs_pct"
  | "mvps"
  | "assists"
  | "rating"

// kills/deaths/assists sort by their per-match average (matching how they're
// displayed), not by career total, so clicking the "Avg K"/"Avg D"/"Avg A"
// column headers sorts by what the column actually shows.
const STAT_COLUMNS: Record<Exclude<LeaderboardStat, "rating">, string> = {
  matches: "COUNT(DISTINCT pms.match_id)",
  kills: "SUM(pms.kills) * 1.0 / COUNT(DISTINCT pms.match_id)",
  deaths: "SUM(pms.deaths) * 1.0 / COUNT(DISTINCT pms.match_id)",
  adr: "AVG(pms.adr)",
  hs_pct: "AVG(pms.hs_pct)",
  mvps: "SUM(pms.mvps)",
  assists: "SUM(pms.assists) * 1.0 / COUNT(DISTINCT pms.match_id)",
}

export type SortDirection = "asc" | "desc"

export type LeaderboardRow = {
  rating: number | null
  ratedGames: number
  teamId: number | null
  steamid64: string
  inGameName: string
  realName: string | null
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
}

export type LeaderboardFilters = {
  stat: LeaderboardStat
  direction?: SortDirection
  division?: string
  team?: string
  season?: string
  limit?: number
}

/**
 * Most recent season present in the scraped roster ("SFL Säsong 9" > "...8"),
 * used as the default scope for the leaderboard/standings. Without this,
 * a player who's played several seasons under the same nickname gets
 * matched to one roster_entries row per season and shows up once per
 * season in aggregates — scoping to one season at a time avoids that.
 */
export async function getCurrentSeason(): Promise<string | null> {
  const rows = (await db.all(
    sql`SELECT DISTINCT t.season AS season FROM teams t WHERE ${SEASON_CUTOFF_SQL}`
  )) as { season: string }[]
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
  filters: LeaderboardFilters,
  database: AppDb = db
): Promise<LeaderboardRow[]> {
  const statExpr =
    filters.stat === "rating"
      ? ratingAverageSql
      : sql.raw(STAT_COLUMNS[filters.stat])
  const direction = filters.direction === "asc" ? sql`ASC` : sql`DESC`

  // Unmatched players (no roster_entries row, so t.season is NULL via the
  // LEFT JOIN) still belong on the board — only exclude rows that are
  // explicitly tied to a pre-season-9 team.
  // Also skip aborted/warmup demos (< 10 rounds) and rows where the player
  // never played (0 kills, deaths and damage) — they count as a match and
  // drag per-match averages down.
  const conditions = [
    sql`(t.season IS NULL OR ${SEASON_CUTOFF_SQL})`,
    sql`m.total_rounds >= 10`,
    sql`NOT (pms.kills = 0 AND pms.deaths = 0 AND pms.damage_total = 0)`,
  ]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
  if (filters.division) conditions.push(sql`t.division = ${filters.division}`)
  if (filters.team) conditions.push(sql`t.name = ${filters.team}`)
  const where = sql.join([sql`WHERE `, sql.join(conditions, sql` AND `)], sql``)

  return (await database.all(
    sql`
      SELECT
        p.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        re.real_name AS realName,
        t.name AS teamName,
        t.id AS teamId,
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
        ${ratingAverageSql} AS rating,
        ${ratedGamesSql} AS ratedGames
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      JOIN matches m ON m.id = pms.match_id
      LEFT JOIN roster_entries re ON re.matched_steamid64 = p.steamid64
      LEFT JOIN teams t ON t.id = re.team_id
      ${where}
      GROUP BY p.steamid64, t.id
      ORDER BY ${filters.stat === "rating" ? sql`${statExpr} IS NULL ASC,` : sql``}
        ${statExpr} ${direction}
        ${filters.stat === "rating" ? sql`, p.steamid64, t.id` : sql``}
      ${filters.limit === undefined ? sql`` : sql`LIMIT ${filters.limit}`}
      `
  )) as LeaderboardRow[]
}

export type TeamStandingRow = {
  teamId: number
  teamName: string
  season: string
  division: string
  logoUrl: string | null
  rosterSize: number
  matchedPlayers: number
  totalKills: number
  totalDeaths: number
  avgAdr: number | null
  matchesPlayed: number
  wins: number
  losses: number
  scoreFor: number
  scoreAgainst: number
}

/**
 * Team-level standings, ranked by official Toornament match results
 * (wins/losses, round-diff tiebreak), with demo-derived stats (kills,
 * deaths, ADR) as supplementary columns. Matches with an unresolved
 * team_a_id/team_b_id are excluded — points can't be attributed to a
 * team we couldn't identify.
 */
export async function getTeamStandings(
  filters: {
    season?: string
    division?: string
  } = {}
): Promise<TeamStandingRow[]> {
  const conditions = [SEASON_CUTOFF_SQL]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
  if (filters.division) conditions.push(sql`t.division = ${filters.division}`)
  const where = sql.join([sql`WHERE `, sql.join(conditions, sql` AND `)], sql``)

  return (await db.all(
    sql`
      SELECT
        t.id AS teamId,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        t.logo_url AS logoUrl,
        COUNT(DISTINCT re.id) AS rosterSize,
        COUNT(DISTINCT re.matched_steamid64) AS matchedPlayers,
        COALESCE(SUM(pms.kills), 0) AS totalKills,
        COALESCE(SUM(pms.deaths), 0) AS totalDeaths,
        AVG(pms.adr) AS avgAdr,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed,
        COALESCE(MAX(m.wins), 0) AS wins,
        COALESCE(MAX(m.losses), 0) AS losses,
        COALESCE(MAX(m.scoreFor), 0) AS scoreFor,
        COALESCE(MAX(m.scoreAgainst), 0) AS scoreAgainst
      FROM teams t
      LEFT JOIN roster_entries re ON re.team_id = t.id
      LEFT JOIN player_match_stats pms ON pms.steamid64 = re.matched_steamid64
      LEFT JOIN (
        SELECT
          teamId,
          SUM(CASE WHEN ownScore > oppScore THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN ownScore < oppScore THEN 1 ELSE 0 END) AS losses,
          SUM(ownScore) AS scoreFor,
          SUM(oppScore) AS scoreAgainst
        FROM (
          SELECT team_a_id AS teamId, team_a_score AS ownScore, team_b_score AS oppScore
          FROM toornament_matches
          WHERE status = 'completed' AND team_a_id IS NOT NULL
            AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
          UNION ALL
          SELECT team_b_id AS teamId, team_b_score AS ownScore, team_a_score AS oppScore
          FROM toornament_matches
          WHERE status = 'completed' AND team_b_id IS NOT NULL
            AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
        )
        GROUP BY teamId
      ) m ON m.teamId = t.id
      ${where}
      GROUP BY t.id
      ORDER BY wins DESC, losses ASC, (scoreFor - scoreAgainst) DESC, totalKills DESC
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

export type MatchNeedingReview = {
  matchId: number
  fileName: string
  demoDate: string | null
  teamResolutionConflict: string
}

/** Demo-ingested matches whose team identity disagrees between a prior
 * Toornament-inferred guess and a later player-matched result (see
 * lib/team-anchoring.ts) — surfaced the same way getUnmatchedRosterEntries
 * surfaces roster review, i.e. no dedicated queue UI, just a read query. */
export async function getMatchesNeedingReview(): Promise<MatchNeedingReview[]> {
  return (await db.all(
    sql`
      SELECT
        m.id AS matchId,
        m.file_name AS fileName,
        m.demo_date AS demoDate,
        m.team_resolution_conflict AS teamResolutionConflict,
        m.server_name AS serverName
      FROM matches m
      WHERE m.team_resolution_conflict IS NOT NULL
      ORDER BY m.demo_date DESC
      `
  )) as MatchNeedingReview[]
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
  logoUrl: string | null
}

export async function getCurrentTeamCatalog(): Promise<TeamMeta[]> {
  const season = await getCurrentSeason()
  if (!season) return []
  return (await db.all(sql`
    SELECT t.id AS teamId, t.name AS teamName, t.season, t.division,
      t.logo_url AS logoUrl
    FROM teams t WHERE t.season = ${season} AND ${SEASON_CUTOFF_SQL}
    ORDER BY t.name, t.id
  `)) as TeamMeta[]
}

/** Every eligible team-season, for the compare page's selector options. */
export async function getTeamOptions(): Promise<TeamMeta[]> {
  return (await db.all(sql`
    SELECT t.id AS teamId, t.name AS teamName, t.season, t.division,
      t.logo_url AS logoUrl
    FROM teams t WHERE ${SEASON_CUTOFF_SQL}
    ORDER BY t.name, t.id
  `)) as TeamMeta[]
}

/** Looks up a single team-season row by id, for the compare page's headers. */
export async function getTeamMeta(teamId: number): Promise<TeamMeta | null> {
  const rows = (await db.all(
    sql`SELECT id AS teamId, name AS teamName, season, division, logo_url AS logoUrl FROM teams WHERE id = ${teamId}`
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
    sql`SELECT id AS teamId, name AS teamName, season, division, logo_url AS logoUrl FROM teams WHERE name = ${name}`
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
  rating: number | null
  ratedGames: number
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
  teamId: number,
  scoped = false,
  database: AppDb = db
): Promise<TeamRosterPlayerRow[]> {
  return (await database.all(
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
        COALESCE(SUM(pms.mvps), 0) AS mvps,
        ${ratingAverageSql} AS rating,
        ${ratedGamesSql} AS ratedGames
      FROM roster_entries re
      LEFT JOIN players p ON p.steamid64 = re.matched_steamid64
      LEFT JOIN player_match_stats pms ON pms.steamid64 = re.matched_steamid64
        ${scoped ? sql`AND pms.match_id IN (SELECT m.id FROM matches m WHERE ${teamDemoScope(teamId)})` : sql``}
      WHERE re.team_id = ${teamId}
      GROUP BY re.id
      ORDER BY kills DESC
      `
  )) as TeamRosterPlayerRow[]
}

export type PlayerSummaryRow = {
  rating: number | null
  ratedGames: number
  steamid64: string
  inGameName: string
  realName: string | null
  matchesPlayed: number
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number
  kd: number | null
}

/**
 * Career-wide aggregate for one player, summed across every team/season
 * they've appeared in (unlike getLeaderboard, which fragments one row per
 * team-season via its `GROUP BY p.steamid64, t.id`).
 */
export async function getPlayerBySteamId64(
  steamid64: string,
  database: AppDb = db
): Promise<PlayerSummaryRow | null> {
  const rows = (await database.all(
    sql`
      SELECT
        p.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        (
          SELECT re.real_name
          FROM roster_entries re
          WHERE re.matched_steamid64 = p.steamid64 AND re.real_name IS NOT NULL
          ORDER BY re.scraped_at DESC
          LIMIT 1
        ) AS realName,
        COUNT(DISTINCT pms.match_id) AS matchesPlayed,
        COALESCE(SUM(pms.kills), 0) AS kills,
        COALESCE(SUM(pms.deaths), 0) AS deaths,
        COALESCE(SUM(pms.assists), 0) AS assists,
        AVG(pms.adr) AS adr,
        AVG(pms.hs_pct) AS hsPct,
        COALESCE(SUM(pms.mvps), 0) AS mvps,
        COALESCE(SUM(pms.kills), 0) * 1.0
          / MAX(COALESCE(SUM(pms.deaths), 0), 1) AS kd,
        ${ratingAverageSql} AS rating,
        ${ratedGamesSql} AS ratedGames
      FROM players p
      LEFT JOIN player_match_stats pms ON pms.steamid64 = p.steamid64
      WHERE p.steamid64 = ${steamid64}
      GROUP BY p.steamid64
      `
  )) as PlayerSummaryRow[]
  return rows[0] ?? null
}

export type LeagueAverageStats = {
  avgKillsPerMatch: number
  avgDeathsPerMatch: number
  avgAssistsPerMatch: number
  avgMvpsPerMatch: number
  avgAdr: number
  avgHsPct: number
  avgKd: number
}

/**
 * League-wide baseline used to color a player's stats green/red (Faceit-
 * style) on the profile page. Averaged per-player-per-match rather than
 * weighted by raw totals, so a player with many matches doesn't skew the
 * baseline more than one with few — mirrors "the average player", not
 * "the average match row".
 */
export async function getLeagueAverageStats(): Promise<LeagueAverageStats> {
  const rows = (await db.all(
    sql`
      WITH player_rates AS (
        SELECT
          pms.steamid64,
          COUNT(DISTINCT pms.match_id) AS matches,
          SUM(pms.kills) AS kills,
          SUM(pms.deaths) AS deaths,
          SUM(pms.assists) AS assists,
          SUM(pms.mvps) AS mvps,
          AVG(pms.adr) AS adr,
          AVG(pms.hs_pct) AS hsPct
        FROM player_match_stats pms
        GROUP BY pms.steamid64
        HAVING COUNT(DISTINCT pms.match_id) > 0
      )
      SELECT
        AVG(kills * 1.0 / matches) AS avgKillsPerMatch,
        AVG(deaths * 1.0 / matches) AS avgDeathsPerMatch,
        AVG(assists * 1.0 / matches) AS avgAssistsPerMatch,
        AVG(COALESCE(mvps, 0) * 1.0 / matches) AS avgMvpsPerMatch,
        AVG(adr) AS avgAdr,
        AVG(hsPct) AS avgHsPct,
        AVG(kills * 1.0 / MAX(deaths, 1)) AS avgKd
      FROM player_rates
      `
  )) as LeagueAverageStats[]
  return rows[0]
}

export type PlayerMatchHistoryRow = {
  rating: number | null
  ratingRounds: number | null
  ratingUnavailableReason: string | null
  teamId: number | null
  opponentTeamId: number | null
  matchId: number
  mapName: string | null
  demoDate: string | null
  teamName: string | null
  opponentTeamName: string | null
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number | null
}

/** Per-match stat lines for one player, most recent demo first. */
export async function getPlayerMatchHistory(
  steamid64: string,
  database: AppDb = db
): Promise<PlayerMatchHistoryRow[]> {
  // Opponent = most common roster team among players on the other CT/T side
  // of the same demo (same fallback the demo page uses), since
  // matches.team_a_id/team_b_id are often unresolved.
  const rows = (await database.all(
    sql`
      SELECT
        m.id AS matchId,
        m.map_name AS mapName,
        m.demo_date AS demoDate,
        (
          SELECT t.name
          FROM roster_entries re
          JOIN teams t ON t.id = re.team_id
          WHERE re.matched_steamid64 = pms.steamid64
          ORDER BY re.scraped_at DESC, re.id DESC
          LIMIT 1
        ) AS teamName,
        (
          SELECT re.team_id FROM roster_entries re
          WHERE re.matched_steamid64 = pms.steamid64
          ORDER BY re.scraped_at DESC, re.id DESC LIMIT 1
        ) AS teamId,
        (
          SELECT opp.name
          FROM (
            SELECT
              (
                SELECT t.name
                FROM roster_entries re
                JOIN teams t ON t.id = re.team_id
                WHERE re.matched_steamid64 = o.steamid64
                ORDER BY re.scraped_at DESC
                LIMIT 1
              ) AS name
            FROM player_match_stats o
            WHERE o.match_id = pms.match_id
              AND o.team_name IS NOT pms.team_name
          ) opp
          WHERE opp.name IS NOT NULL
          GROUP BY opp.name
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS opponentTeamName,
        pms.kills AS kills,
        pms.deaths AS deaths,
        pms.assists AS assists,
        pms.adr AS adr,
        pms.hs_pct AS hsPct,
        pms.mvps AS mvps,
        CASE WHEN pms.rating_version = ${RATING_VERSION} THEN pms.rating END AS rating,
        CASE WHEN pms.rating_version = ${RATING_VERSION} THEN pms.rating_rounds END AS ratingRounds,
        CASE WHEN pms.rating_version IS NOT NULL AND pms.rating_version != ${RATING_VERSION}
            THEN 'Rating version requires recomputation'
            ELSE pms.rating_unavailable_reason END AS ratingUnavailableReason
      FROM player_match_stats pms
      JOIN matches m ON m.id = pms.match_id
      WHERE pms.steamid64 = ${steamid64}
      ORDER BY m.demo_date DESC
      `
  )) as PlayerMatchHistoryRow[]
  const identities = new Map(
    (
      await getDemoMatches(
        database,
        rows.map((row) => row.matchId)
      )
    ).map((match) => [match.matchId, match])
  )
  return rows.map((row) => {
    const match = identities.get(row.matchId)
    const opponentTeamId =
      row.teamId !== null && match?.teamAId === row.teamId
        ? (match.teamBId ?? null)
        : row.teamId !== null && match?.teamBId === row.teamId
          ? (match.teamAId ?? null)
          : null
    return { ...row, opponentTeamId }
  })
}

export type DemoMatchDetail = DemoMatchRow & {
  teamAId: number | null
  teamALogoUrl: string | null
  teamBId: number | null
  teamBLogoUrl: string | null
  teamASide: string | null
  teamBSide: string | null
  teamResolutionConflict: string | null
}

export async function getMatchTeams(
  season: string,
  database: AppDb = db
): Promise<MatchTeam[]> {
  return database.all<MatchTeam>(sql`
    SELECT t.id AS teamId, t.name AS teamName, t.season, t.division
    FROM teams t
    WHERE t.season = ${season} AND ${SEASON_CUTOFF_SQL}
    ORDER BY t.division, t.name, t.id
  `)
}

/**
 * Team names from a MatchZy server name ("MatchZy | Telia_Sverige_AB vs
 * team_Falken"), resolved to current-season teams; unresolvable names are
 * dropped.
 */
function serverNameTeams(
  serverName: string | null,
  teams: TeamMeta[]
): TeamMeta[] {
  if (!serverName) return []
  const [, matchup = serverName] = serverName.split("|").map((p) => p.trim())
  const found: TeamMeta[] = []
  for (const raw of matchup.split(/\s+vs\s+/i)) {
    const name = raw
      .replace(/^team_/i, "")
      .replace(/_/g, " ")
      .trim()
    const team = name ? resolveOfficialTeam(name, teams) : null
    if (team) found.push(teams.find((t) => t.teamId === team.teamId)!)
  }
  return found
}

/** All eligible demos, including those without resolved teams or player stats.
 * `matchIds` scopes the work to those demos; each demo's resolution only uses
 * its own evidence, so scoped rows equal the corresponding unscoped rows. */
export async function getDemoMatches(
  database: AppDb = db,
  matchIds?: number | number[]
): Promise<DemoMatchDetail[]> {
  const ids = matchIds === undefined ? undefined : [matchIds].flat()
  if (ids?.length === 0) return []
  const idList = ids && sql.join(ids, sql`, `)
  type Source = Omit<
    DemoMatchDetail,
    "teamASide" | "teamBSide" | "scoreSource"
  > & {
    teamASeason: string | null
    teamBSeason: string | null
    serverName: string | null
  }
  type RosterTeam = MatchTeam & {
    logoUrl: string | null
    matchId: number
    side: string | null
    votes: number
  }

  const [matches, rosterTeams, playerSides, eligibleTeams] = await Promise.all([
    database.all<Source>(sql`
      SELECT m.id AS matchId, m.map_name AS mapName, m.demo_date AS demoDate,
        m.team_a_id AS teamAId, ta.name AS teamAName,
        ta.season AS teamASeason, ta.division AS teamADivision,
        ta.logo_url AS teamALogoUrl, m.team_a_score AS teamAScore,
        m.team_b_id AS teamBId, tb.name AS teamBName,
        tb.season AS teamBSeason, tb.division AS teamBDivision,
        tb.logo_url AS teamBLogoUrl, m.team_b_score AS teamBScore,
        m.team_resolution_conflict AS teamResolutionConflict
      FROM matches m
      LEFT JOIN teams ta ON ta.id = m.team_a_id
      LEFT JOIN teams tb ON tb.id = m.team_b_id
      ${idList === undefined ? sql`` : sql`WHERE m.id IN (${idList})`}
    `),
    database.all<RosterTeam>(sql`
      WITH latest_roster AS (
        SELECT re.matched_steamid64, t.id AS teamId,
          t.name AS teamName, t.season, t.division, t.logo_url AS logoUrl,
          ROW_NUMBER() OVER (
            PARTITION BY re.matched_steamid64
            ORDER BY CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) DESC,
              re.scraped_at DESC, re.id DESC
          ) AS rank
        FROM roster_entries re
        JOIN teams t ON t.id = re.team_id
        WHERE re.matched_steamid64 IS NOT NULL
      )
      SELECT pms.match_id AS matchId, pms.team_name AS side,
        r.teamId, r.teamName, r.season, r.division, r.logoUrl, COUNT(*) AS votes
      FROM player_match_stats pms
      JOIN matches m ON m.id = pms.match_id
      JOIN latest_roster r ON r.matched_steamid64 = pms.steamid64 AND r.rank = 1
      ${idList === undefined ? sql`` : sql`WHERE m.id IN (${idList})`}
      GROUP BY pms.match_id, pms.team_name, r.teamId
      ORDER BY pms.match_id, pms.team_name, votes DESC, r.teamId
    `),
    database.all<{ matchId: number; side: string }>(sql`
      SELECT DISTINCT pms.match_id AS matchId, pms.team_name AS side
      FROM player_match_stats pms
      WHERE pms.team_name IS NOT NULL
        ${idList === undefined ? sql`` : sql`AND pms.match_id IN (${idList})`}
      ORDER BY pms.match_id, pms.team_name
    `),
    database.all<TeamMeta>(sql`
      SELECT t.id AS teamId, t.name AS teamName, t.season, t.division,
        t.logo_url AS logoUrl
      FROM teams t WHERE ${SEASON_CUTOFF_SQL}
    `),
  ])

  // Latest eligible season, read via `database` like everything else here.
  const latestSeason = Math.max(
    ...eligibleTeams.map((team) => Number(team.season.match(/\d+/)?.[0])),
    -Infinity
  )
  const seasonTeams = eligibleTeams.filter(
    (team) => Number(team.season.match(/\d+/)?.[0]) === latestSeason
  )

  const sidesByMatch = new Map<number, Map<string, RosterTeam[]>>()
  for (const { matchId, side } of playerSides) {
    let sides = sidesByMatch.get(matchId)
    if (!sides) {
      sides = new Map()
      sidesByMatch.set(matchId, sides)
    }
    sides.set(side, [])
  }
  const evidence = new Map<number, RosterTeam[]>()
  for (const team of rosterTeams) {
    const existing = evidence.get(team.matchId)
    if (existing) existing.push(team)
    else evidence.set(team.matchId, [team])
  }

  function seasonNumber(season: string | null) {
    return season ? Number(season.match(/\d+/)?.[0]) : NaN
  }

  const rows: DemoMatchDetail[] = []
  for (const match of matches) {
    const teams = evidence.get(match.matchId) ?? []
    const seasons = [
      match.teamASeason,
      match.teamBSeason,
      ...teams.map((team) => team.season),
    ].filter((season) => season !== null)
    if (
      seasons.length > 0 &&
      seasons.every((season) => seasonNumber(season) < MIN_SEASON)
    ) {
      continue
    }

    const sides =
      sidesByMatch.get(match.matchId) ?? new Map<string, RosterTeam[]>()
    for (const team of teams) {
      if (team.side === null) continue
      const existing = sides.get(team.side)
      if (existing) existing.push(team)
      else sides.set(team.side, [team])
    }

    function majority(candidates: RosterTeam[]): RosterTeam | null {
      const [best, second] = candidates
      return best &&
        best.votes !== second?.votes &&
        seasonNumber(best.season) >= MIN_SEASON
        ? best
        : null
    }

    let fallbackA: RosterTeam | null = null
    let fallbackB: RosterTeam | null = null
    let [teamASide = null, teamBSide = null]: (string | null)[] = [
      ...sides.keys(),
    ]
    function anchoredSide(id: number | null, name: string | null) {
      if (id === null) return null
      const anchors = [...sides.entries()].filter(([, candidates]) =>
        candidates.some((team) => team.teamId === id || team.teamName === name)
      )
      return anchors.length === 1 ? anchors[0][0] : null
    }
    if (match.teamAId === null && match.teamBId === null && sides.size <= 2) {
      const [sideA, sideB] = [...sides.values()]
      fallbackA = sideA ? majority(sideA) : null
      fallbackB = sideB ? majority(sideB) : null
      if (fallbackA?.teamId === fallbackB?.teamId) fallbackB = null
    } else if ((match.teamAId === null) !== (match.teamBId === null)) {
      const knownId = match.teamAId ?? match.teamBId
      const knownSide = anchoredSide(
        knownId,
        match.teamAName ?? match.teamBName
      )
      // A stored team's A/B slot is not necessarily the first CT/T group.
      teamASide = match.teamAId === null ? null : knownSide
      teamBSide = match.teamBId === null ? null : knownSide
      if (knownSide !== null && sides.size === 2) {
        const opponentSide = [...sides.entries()].find(
          ([side]) => side !== knownSide
        )
        const opponent = opponentSide ? majority(opponentSide[1]) : null
        if (match.teamAId === null) teamASide = opponentSide?.[0] ?? null
        else teamBSide = opponentSide?.[0] ?? null
        if (opponent?.teamId !== knownId) {
          if (match.teamAId === null) fallbackA = opponent
          else fallbackB = opponent
        }
      }
    } else if (match.teamAId !== null && match.teamBId !== null) {
      teamASide = anchoredSide(match.teamAId, match.teamAName)
      teamBSide = anchoredSide(match.teamBId, match.teamBName)
      if (teamASide !== null && teamASide === teamBSide) {
        teamASide = null
        teamBSide = null
      }
      // With exactly two sides and one team anchored, the other team can
      // only be the remaining side, even if its roster evidence is stale.
      if (sides.size === 2) {
        const remaining = [...sides.keys()].find(
          (side) => side !== (teamASide ?? teamBSide)
        )
        if (teamASide !== null && teamBSide === null)
          teamBSide = remaining ?? null
        else if (teamBSide !== null && teamASide === null)
          teamASide = remaining ?? null
      }
    } else {
      teamASide = null
      teamBSide = null
    }

    // Last resort for a slot still without a team: the team names MatchZy
    // put in the server name ("A vs B"), matched strictly against the
    // current season. A name already used by the other slot is skipped, and
    // an unmatched or ambiguous name leaves the slot unknown. Sides stay
    // unassigned since the name order says nothing about CT/T.
    let nameA: TeamMeta | null = null
    let nameB: TeamMeta | null = null
    const idA = match.teamAId ?? fallbackA?.teamId ?? null
    const idB = match.teamBId ?? fallbackB?.teamId ?? null
    if (idA === null || idB === null) {
      const named = serverNameTeams(match.serverName, seasonTeams)
        .filter((team) => team.teamId !== idA && team.teamId !== idB)
        .filter((team, i, all) => all.indexOf(team) === i)
      if (idA === null && idB === null) {
        if (named.length === 2) [nameA, nameB] = named
      } else if (named.length === 1) {
        if (idA === null) nameA = named[0]
        else nameB = named[0]
      }
    }

    rows.push({
      matchId: match.matchId,
      teamAId: match.teamAId ?? fallbackA?.teamId ?? nameA?.teamId ?? null,
      teamBId: match.teamBId ?? fallbackB?.teamId ?? nameB?.teamId ?? null,
      mapName: match.mapName,
      demoDate: match.demoDate,
      teamAName:
        match.teamAName ?? fallbackA?.teamName ?? nameA?.teamName ?? null,
      teamBName:
        match.teamBName ?? fallbackB?.teamName ?? nameB?.teamName ?? null,
      teamALogoUrl:
        match.teamALogoUrl ?? fallbackA?.logoUrl ?? nameA?.logoUrl ?? null,
      teamBLogoUrl:
        match.teamBLogoUrl ?? fallbackB?.logoUrl ?? nameB?.logoUrl ?? null,
      teamASide,
      teamBSide,
      teamResolutionConflict: match.teamResolutionConflict,
      teamADivision:
        (seasonNumber(match.teamASeason) >= MIN_SEASON
          ? match.teamADivision
          : null) ??
        fallbackA?.division ??
        nameA?.division ??
        null,
      teamBDivision:
        (seasonNumber(match.teamBSeason) >= MIN_SEASON
          ? match.teamBDivision
          : null) ??
        fallbackB?.division ??
        nameB?.division ??
        null,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      scoreSource:
        match.teamAScore !== null || match.teamBScore !== null ? "demo" : null,
    })
  }

  const missingScores = rows.filter(
    (row) => row.scoreSource === null && row.teamAName && row.teamBName
  )
  if (missingScores.length) {
    const completed = await getCompletedDemoResults(database)
    for (const row of missingScores) {
      if (!row.teamAName || !row.teamBName) continue
      const result = findToornamentScoreForDemo(
        row.demoDate,
        row.teamAName,
        row.teamBName,
        completed
      )
      if (result) {
        row.teamAScore = result.teamAScore
        row.teamBScore = result.teamBScore
        row.scoreSource = "official"
      }
    }
  }

  return rows.sort(
    (a, b) =>
      (matchDateTime(b.demoDate) ?? -Infinity) -
        (matchDateTime(a.demoDate) ?? -Infinity) || b.matchId - a.matchId
  )
}

/** Match header info (map, date, resolved team names/scores) for a single demo-ingested match. */
export async function getDemoMatchById(
  matchId: number,
  database: AppDb = db
): Promise<DemoMatchDetail | null> {
  const rows = await getDemoMatches(database, matchId)
  return rows[0] ?? null
}

export type DemoMatchPlayerStatsRow = {
  rating: number | null
  ratingRounds: number | null
  ratingUnavailableReason: string | null
  rosterTeamId: number | null
  steamid64: string
  inGameName: string
  // The in-game CT/T side the player was on for this demo (CS2's
  // team_num, stringified) — only useful for splitting the roster into
  // two sides, not as a display name. See rosterTeamName for that.
  side: string | null
  // The player's roster identity from the latest available season,
  // with scrape time breaking ties, matching the demo-header resolver.
  rosterTeamName: string | null
  // That same roster team's logo, for when `matches.team_a/b_id` wasn't
  // resolved at ingestion time and the page falls back to the roster name.
  rosterTeamLogoUrl: string | null
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number | null
}

/** Every player's stat line for a single demo-ingested match, highest kills first. */
export async function getDemoMatchPlayerStats(
  matchId: number,
  database: AppDb = db
): Promise<DemoMatchPlayerStatsRow[]> {
  return (await database.all(
    sql`
      SELECT
        pms.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        pms.team_name AS side,
        (
          SELECT t.name
          FROM roster_entries re
          JOIN teams t ON t.id = re.team_id
          WHERE re.matched_steamid64 = pms.steamid64
          ORDER BY CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) DESC,
            re.scraped_at DESC, re.id DESC
          LIMIT 1
        ) AS rosterTeamName,
        (
          SELECT re.team_id FROM roster_entries re
          JOIN teams t ON t.id = re.team_id
          WHERE re.matched_steamid64 = pms.steamid64
          ORDER BY CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) DESC,
            re.scraped_at DESC, re.id DESC LIMIT 1
        ) AS rosterTeamId,
        (
          SELECT t.logo_url
          FROM roster_entries re
          JOIN teams t ON t.id = re.team_id
          WHERE re.matched_steamid64 = pms.steamid64
          ORDER BY CAST(TRIM(REPLACE(t.season, 'SFL Säsong', '')) AS INTEGER) DESC,
            re.scraped_at DESC, re.id DESC
          LIMIT 1
        ) AS rosterTeamLogoUrl,
        pms.kills AS kills,
        pms.deaths AS deaths,
        pms.assists AS assists,
        pms.adr AS adr,
        pms.hs_pct AS hsPct,
        pms.mvps AS mvps,
        CASE WHEN pms.rating_version = ${RATING_VERSION} THEN pms.rating END AS rating,
        CASE WHEN pms.rating_version = ${RATING_VERSION} THEN pms.rating_rounds END AS ratingRounds,
        CASE WHEN pms.rating_version IS NOT NULL AND pms.rating_version != ${RATING_VERSION}
            THEN 'Rating version requires recomputation'
            ELSE pms.rating_unavailable_reason END AS ratingUnavailableReason
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      WHERE pms.match_id = ${matchId}
      ORDER BY pms.kills DESC
      `
  )) as DemoMatchPlayerStatsRow[]
}

export async function getDemoRatingDetails(
  matchId: number,
  database: AppDb = db
) {
  return Object.fromEntries(await getMatchRatingSummaries(database, matchId))
}

export type MatchKillRow = {
  attackerSteamid64: string | null
  attackerX: number | null
  attackerY: number | null
  attackerSide: string | null
  victimSteamid64: string
  victimX: number | null
  victimY: number | null
  victimSide: string | null
  weapon: string | null
  headshot: number | null
}

export async function getMatchKills(matchId: number): Promise<MatchKillRow[]> {
  return (await db.all(
    sql`
      SELECT
        attacker_steamid64 AS attackerSteamid64,
        attacker_x AS attackerX,
        attacker_y AS attackerY,
        attacker_side AS attackerSide,
        victim_steamid64 AS victimSteamid64,
        victim_x AS victimX,
        victim_y AS victimY,
        victim_side AS victimSide,
        weapon,
        headshot
      FROM match_kills
      WHERE match_id = ${matchId}
      ORDER BY tick
      `
  )) as MatchKillRow[]
}

export type PlayerKillRow = MatchKillRow & { mapName: string }

// Every kill event a player took part in (as killer or victim) across all
// parsed demos, with the map it happened on, for the player-page heatmaps.
export async function getPlayerKills(
  steamid64: string
): Promise<PlayerKillRow[]> {
  return queryPlayerKills(steamid64)
}

export async function getPlayerKillMatchIds(
  steamid64: string
): Promise<number[]> {
  const rows = await db.all<{ matchId: number }>(sql`
    SELECT DISTINCT mk.match_id AS matchId
    FROM match_kills mk JOIN matches m ON m.id = mk.match_id
    WHERE m.map_name IS NOT NULL
      AND (mk.attacker_steamid64 = ${steamid64} OR mk.victim_steamid64 = ${steamid64})
    ORDER BY mk.match_id
  `)
  return rows.map((row) => row.matchId)
}

export async function getPlayerKillsInMatch(
  steamid64: string,
  matchId: number
): Promise<PlayerKillRow[]> {
  return queryPlayerKills(steamid64, matchId)
}

async function queryPlayerKills(
  steamid64: string,
  matchId?: number
): Promise<PlayerKillRow[]> {
  return (await db.all(
    sql`
      SELECT
        m.map_name AS mapName,
        mk.attacker_steamid64 AS attackerSteamid64,
        mk.attacker_x AS attackerX,
        mk.attacker_y AS attackerY,
        mk.attacker_side AS attackerSide,
        mk.victim_steamid64 AS victimSteamid64,
        mk.victim_x AS victimX,
        mk.victim_y AS victimY,
        mk.victim_side AS victimSide,
        mk.weapon,
        mk.headshot
      FROM match_kills mk
      JOIN matches m ON m.id = mk.match_id
      WHERE m.map_name IS NOT NULL
        AND (mk.attacker_steamid64 = ${steamid64}
          OR mk.victim_steamid64 = ${steamid64})
        ${matchId === undefined ? sql`` : sql`AND mk.match_id = ${matchId}`}
      `
  )) as PlayerKillRow[]
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
export async function getTeamMapStats(teamId: number): Promise<TeamMapStat[]> {
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

export type TeamDemoMatchRow = {
  opponentTeamId: number | null
  matchId: number
  mapName: string | null
  demoDate: string | null
  opponentTeamName: string | null
  teamScore: number | null
  opponentScore: number | null
}

/**
 * Ingested demos involving this team, newest first — mirrors
 * getPlayerMatchHistory's shape so the demo page the row links to is the
 * same /matches/demo/[matchId] either way. Membership is via roster_entries
 * (same as getTeamMapStats), not matches.team_a/b_id, since that's often
 * unresolved; opponent name/score fall back to the majority roster team on
 * the other side of each demo for the same reason getPlayerMatchHistory and
 * the demo match page itself do.
 */
export async function getTeamDemoMatches(
  teamId: number,
  scoped = false,
  database: AppDb = db
): Promise<TeamDemoMatchRow[]> {
  const rows = (await database.all(
    sql`
      SELECT
        m.id AS matchId,
        m.map_name AS mapName,
        m.demo_date AS demoDate,
        CASE WHEN m.team_a_id = ${teamId} THEN m.team_b_id
             WHEN m.team_b_id = ${teamId} THEN m.team_a_id
             ELSE NULL END AS opponentTeamId,
        (
          SELECT opp.name
          FROM (
            SELECT
              (
                SELECT t.name
                FROM roster_entries re
                JOIN teams t ON t.id = re.team_id
                WHERE re.matched_steamid64 = o.steamid64
                ORDER BY re.scraped_at DESC
                LIMIT 1
              ) AS name
            FROM player_match_stats o
            WHERE o.match_id = m.id
              AND o.team_name IS NOT (
                SELECT MIN(pms.team_name)
                FROM player_match_stats pms
                JOIN roster_entries re ON re.matched_steamid64 = pms.steamid64
                WHERE pms.match_id = m.id AND re.team_id = ${teamId}
              )
          ) opp
          WHERE opp.name IS NOT NULL
          GROUP BY opp.name
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS opponentTeamName,
        CASE
          WHEN m.team_a_id = ${teamId} THEN m.team_a_score
          WHEN m.team_b_id = ${teamId} THEN m.team_b_score
          ELSE NULL
        END AS teamScore,
        CASE
          WHEN m.team_a_id = ${teamId} THEN m.team_b_score
          WHEN m.team_b_id = ${teamId} THEN m.team_a_score
          ELSE NULL
        END AS opponentScore
      FROM matches m
      WHERE ${
        scoped
          ? teamDemoScope(teamId)
          : sql`m.id IN (
        SELECT DISTINCT pms.match_id
        FROM player_match_stats pms
        JOIN roster_entries re ON re.matched_steamid64 = pms.steamid64
        WHERE re.team_id = ${teamId}
      )`
      }
      ORDER BY m.demo_date DESC
      `
  )) as TeamDemoMatchRow[]

  const identities = new Map(
    (
      await getDemoMatches(
        database,
        rows.map((row) => row.matchId)
      )
    ).map((match) => [match.matchId, match])
  )
  for (const row of rows) {
    const match = identities.get(row.matchId)
    if (!match) continue
    if (match.teamAId === teamId) {
      row.opponentTeamId = match.teamBId ?? null
      row.opponentTeamName = match.teamBName ?? row.opponentTeamName
    } else if (match.teamBId === teamId) {
      row.opponentTeamId = match.teamAId ?? null
      row.opponentTeamName = match.teamAName ?? row.opponentTeamName
    }
  }

  if (rows.every((r) => r.teamScore != null)) return rows

  // matches.team_a/b_score is only filled when ingest resolved both teams, so
  // fall back to the completed Toornament match this demo corresponds to:
  // same team, scheduled within a few days of the demo (demo_date can lag
  // the scheduled slot), closest wins, same opponent when known.
  const completed = (await database.all(
    sql`
      SELECT
        scheduled_at AS scheduledAt,
        team_a_id AS teamAId,
        team_a_name_raw AS teamAName,
        team_b_name_raw AS teamBName,
        team_a_score AS teamAScore,
        team_b_score AS teamBScore
      FROM toornament_matches
      WHERE status = 'completed' AND scheduled_at IS NOT NULL
        AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
        AND (team_a_id = ${teamId} OR team_b_id = ${teamId})
      `
  )) as {
    scheduledAt: string
    teamAId: number | null
    teamAName: string
    teamBName: string
    teamAScore: number
    teamBScore: number
  }[]

  const WINDOW_MS = 4 * 24 * 60 * 60 * 1000
  return rows.map((r) => {
    if (r.teamScore != null || !r.demoDate) return r
    const demoTime = new Date(r.demoDate).getTime()
    if (Number.isNaN(demoTime)) return r

    let best: { diff: number; row: (typeof completed)[number] } | null = null
    for (const c of completed) {
      const diff = Math.abs(new Date(c.scheduledAt).getTime() - demoTime)
      if (!(diff <= WINDOW_MS)) continue
      const isTeamA = c.teamAId === teamId
      const opponent = isTeamA ? c.teamBName : c.teamAName
      if (
        r.opponentTeamName &&
        scoreSimilarity(opponent, r.opponentTeamName) < MATCH_THRESHOLD_LOW
      )
        continue
      if (!best || diff < best.diff) best = { diff, row: c }
    }
    if (!best) return r

    const isTeamA = best.row.teamAId === teamId
    return {
      ...r,
      opponentTeamName:
        r.opponentTeamName ??
        (isTeamA ? best.row.teamBName : best.row.teamAName),
      teamScore: isTeamA ? best.row.teamAScore : best.row.teamBScore,
      opponentScore: isTeamA ? best.row.teamBScore : best.row.teamAScore,
    }
  })
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
export async function getMatchById(
  matchId: string
): Promise<MatchDetail | null> {
  const rows = (await db.all(
    sql`
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
      WHERE toornament_match_id = ${matchId}
      `
  )) as MatchDetail[]
  return rows[0] ?? null
}

/**
 * Fallback result for a demo whose `matches.team_a/b_score` was never filled
 * (ingest only stores it when both teams resolved): finds the completed
 * Toornament match between these two team names scheduled within a few days
 * of the demo, closest first, and returns its score oriented as [A, B].
 */
export async function getToornamentScoreForDemo(
  demoDate: string | null,
  teamAName: string,
  teamBName: string,
  database: AppDb = db
): Promise<{ teamAScore: number; teamBScore: number } | null> {
  if (matchDateTime(demoDate) === null) return null
  return findToornamentScoreForDemo(
    demoDate,
    teamAName,
    teamBName,
    await getCompletedDemoResults(database)
  )
}

type CompletedDemoResult = {
  scheduledAt: string
  teamAName: string
  teamBName: string
  teamAScore: number
  teamBScore: number
}

async function getCompletedDemoResults(database: AppDb) {
  return database.all<CompletedDemoResult>(
    sql`
      SELECT
        scheduled_at AS scheduledAt,
        team_a_name_raw AS teamAName,
        team_b_name_raw AS teamBName,
        team_a_score AS teamAScore,
        team_b_score AS teamBScore
      FROM toornament_matches
      WHERE status = 'completed' AND scheduled_at IS NOT NULL
        AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
      `
  )
}

function findToornamentScoreForDemo(
  demoDate: string | null,
  teamAName: string,
  teamBName: string,
  rows: CompletedDemoResult[]
): { teamAScore: number; teamBScore: number } | null {
  const demoTime = matchDateTime(demoDate)
  if (demoTime === null) return null

  const WINDOW_MS = 4 * 24 * 60 * 60 * 1000
  let best: {
    diff: number
    teamAScore: number
    teamBScore: number
  } | null = null
  let tied = false
  for (const r of rows) {
    const diff = Math.abs(new Date(r.scheduledAt).getTime() - demoTime)
    if (!(diff <= WINDOW_MS) || (best && diff > best.diff)) continue
    const straightA = scoreSimilarity(r.teamAName, teamAName)
    const straightB = scoreSimilarity(r.teamBName, teamBName)
    const swappedA = scoreSimilarity(r.teamAName, teamBName)
    const swappedB = scoreSimilarity(r.teamBName, teamAName)
    let straight =
      straightA >= MATCH_THRESHOLD_LOW && straightB >= MATCH_THRESHOLD_LOW
    let swapped =
      swappedA >= MATCH_THRESHOLD_LOW && swappedB >= MATCH_THRESHOLD_LOW
    if (straight && swapped) {
      const exactStraight = straightA === 1 && straightB === 1
      const exactSwapped = swappedA === 1 && swappedB === 1
      if (exactStraight === exactSwapped) continue
      straight = exactStraight
      swapped = exactSwapped
    }
    if (!straight && !swapped) continue
    if (best && diff === best.diff) {
      tied = true
      continue
    }
    tied = false
    if (straight) {
      best = { diff, teamAScore: r.teamAScore, teamBScore: r.teamBScore }
    } else if (swapped) {
      best = { diff, teamAScore: r.teamBScore, teamBScore: r.teamAScore }
    }
  }
  return best && !tied
    ? { teamAScore: best.teamAScore, teamBScore: best.teamBScore }
    : null
}

export type AdminRosterEntry = {
  id: number
  nickname: string
  realName: string | null
  teamName: string
  season: string
  division: string
  steamid64: string | null
  matchStatus: string
}

/** Current-season roster entries for the local-only /admin steamid editor. With no query,
 * entries still needing review come first; a query filters by nickname,
 * real name, team or steamid64. */
export async function getAdminRosterEntries(
  query: string
): Promise<AdminRosterEntry[]> {
  const q = `%${query.trim().toLowerCase()}%`
  const season = await getCurrentSeason()
  if (!season) return []
  return (await db.all(
    sql`
      SELECT
        re.id AS id,
        re.nickname AS nickname,
        re.real_name AS realName,
        t.name AS teamName,
        t.season AS season,
        t.division AS division,
        re.matched_steamid64 AS steamid64,
        re.match_status AS matchStatus
      FROM roster_entries re
      JOIN teams t ON t.id = re.team_id
      WHERE t.season = ${season}
        AND (
          ${q} = '%%'
          OR LOWER(re.nickname) LIKE ${q}
          OR LOWER(COALESCE(re.real_name, '')) LIKE ${q}
          OR LOWER(t.name) LIKE ${q}
          OR COALESCE(re.matched_steamid64, '') LIKE ${q}
        )
      ORDER BY
        CASE re.match_status WHEN 'manual' THEN 2 WHEN 'auto_high' THEN 1 ELSE 0 END,
        t.name, re.nickname
      LIMIT 200
      `
  )) as AdminRosterEntry[]
}

/** Twitch stream URLs for upcoming matches, keyed by Toornament match id. */
export async function getMatchStreams(): Promise<
  Record<string, { url: string; caster: string | null }>
> {
  const rows = (await db.all(
    sql`SELECT toornament_match_id AS matchId, stream_url AS url, caster FROM match_streams`
  )) as { matchId: string; url: string; caster: string | null }[]
  return Object.fromEntries(
    rows.map((r) => [r.matchId, { url: r.url, caster: r.caster }])
  )
}

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
  "matches" | "kills" | "deaths" | "adr" | "hs_pct" | "mvps" | "assists"

// kills/deaths/assists sort by their per-match average (matching how they're
// displayed), not by career total, so clicking the "Avg K"/"Avg D"/"Avg A"
// column headers sorts by what the column actually shows.
const STAT_COLUMNS: Record<LeaderboardStat, string> = {
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
  filters: LeaderboardFilters
): Promise<LeaderboardRow[]> {
  const statExpr = sql.raw(STAT_COLUMNS[filters.stat])
  const direction = filters.direction === "asc" ? sql`ASC` : sql`DESC`

  // Unmatched players (no roster_entries row, so t.season is NULL via the
  // LEFT JOIN) still belong on the board — only exclude rows that are
  // explicitly tied to a pre-season-9 team.
  const conditions = [sql`(t.season IS NULL OR ${SEASON_CUTOFF_SQL})`]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
  if (filters.division) conditions.push(sql`t.division = ${filters.division}`)
  if (filters.team) conditions.push(sql`t.name = ${filters.team}`)
  const where = sql.join([sql`WHERE `, sql.join(conditions, sql` AND `)], sql``)

  return (await db.all(
    sql`
      SELECT
        p.steamid64 AS steamid64,
        p.latest_ingame_name AS inGameName,
        re.real_name AS realName,
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
        SUM(pms.mvps) AS mvps
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      LEFT JOIN roster_entries re ON re.matched_steamid64 = p.steamid64
      LEFT JOIN teams t ON t.id = re.team_id
      ${where}
      GROUP BY p.steamid64, t.id
      ORDER BY ${statExpr} ${direction}
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
  } = {}
): Promise<TeamStandingRow[]> {
  const conditions = [SEASON_CUTOFF_SQL]
  if (filters.season) conditions.push(sql`t.season = ${filters.season}`)
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

export type PlayerSummaryRow = {
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
  kda: number | null
}

/**
 * Career-wide aggregate for one player, summed across every team/season
 * they've appeared in (unlike getLeaderboard, which fragments one row per
 * team-season via its `GROUP BY p.steamid64, t.id`).
 */
export async function getPlayerBySteamId64(
  steamid64: string
): Promise<PlayerSummaryRow | null> {
  const rows = (await db.all(
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
        (COALESCE(SUM(pms.kills), 0) + COALESCE(SUM(pms.assists), 0)) * 1.0
          / MAX(COALESCE(SUM(pms.deaths), 0), 1) AS kda
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
  avgKda: number
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
        AVG((kills + assists) * 1.0 / MAX(deaths, 1)) AS avgKda
      FROM player_rates
      `
  )) as LeagueAverageStats[]
  return rows[0]
}

export type PlayerMatchHistoryRow = {
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
  steamid64: string
): Promise<PlayerMatchHistoryRow[]> {
  // Opponent = most common roster team among players on the other CT/T side
  // of the same demo (same fallback the demo page uses), since
  // matches.team_a_id/team_b_id are often unresolved.
  return (await db.all(
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
          ORDER BY re.scraped_at DESC
          LIMIT 1
        ) AS teamName,
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
        pms.mvps AS mvps
      FROM player_match_stats pms
      JOIN matches m ON m.id = pms.match_id
      WHERE pms.steamid64 = ${steamid64}
      ORDER BY m.demo_date DESC
      `
  )) as PlayerMatchHistoryRow[]
}

export type DemoMatchDetail = {
  matchId: number
  mapName: string | null
  demoDate: string | null
  teamAId: number | null
  teamAName: string | null
  teamAScore: number | null
  teamBId: number | null
  teamBName: string | null
  teamBScore: number | null
}

/** Match header info (map, date, resolved team names/scores) for a single demo-ingested match. */
export async function getDemoMatchById(
  matchId: number
): Promise<DemoMatchDetail | null> {
  const rows = (await db.all(
    sql`
      SELECT
        m.id AS matchId,
        m.map_name AS mapName,
        m.demo_date AS demoDate,
        m.team_a_id AS teamAId,
        ta.name AS teamAName,
        m.team_a_score AS teamAScore,
        m.team_b_id AS teamBId,
        tb.name AS teamBName,
        m.team_b_score AS teamBScore
      FROM matches m
      LEFT JOIN teams ta ON ta.id = m.team_a_id
      LEFT JOIN teams tb ON tb.id = m.team_b_id
      WHERE m.id = ${matchId}
      `
  )) as DemoMatchDetail[]
  return rows[0] ?? null
}

export type DemoMatchPlayerStatsRow = {
  steamid64: string
  inGameName: string
  // The in-game CT/T side the player was on for this demo (CS2's
  // team_num, stringified) — only useful for splitting the roster into
  // two sides, not as a display name. See rosterTeamName for that.
  side: string | null
  // The player's actual roster team name (most recently scraped), used
  // to resolve a real display name for each side.
  rosterTeamName: string | null
  kills: number
  deaths: number
  assists: number
  adr: number | null
  hsPct: number | null
  mvps: number | null
}

/** Every player's stat line for a single demo-ingested match, highest kills first. */
export async function getDemoMatchPlayerStats(
  matchId: number
): Promise<DemoMatchPlayerStatsRow[]> {
  return (await db.all(
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
          ORDER BY re.scraped_at DESC
          LIMIT 1
        ) AS rosterTeamName,
        pms.kills AS kills,
        pms.deaths AS deaths,
        pms.assists AS assists,
        pms.adr AS adr,
        pms.hs_pct AS hsPct,
        pms.mvps AS mvps
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      WHERE pms.match_id = ${matchId}
      ORDER BY pms.kills DESC
      `
  )) as DemoMatchPlayerStatsRow[]
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

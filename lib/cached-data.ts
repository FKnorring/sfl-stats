import { cacheLife, cacheTag } from "next/cache"
import * as queries from "@/lib/db"
import * as faceit from "@/lib/faceit"
import { cacheScope, scopedCacheTag } from "@/lib/cache-policy"

export type * from "@/lib/db"

async function currentSeason(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getCurrentSeason()
}
export function getCurrentSeason() {
  return currentSeason(cacheScope())
}

async function seasons(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getSeasons()
}
export function getSeasons() {
  return seasons(cacheScope())
}

async function divisions(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getDivisions()
}
export function getDivisions() {
  return divisions(cacheScope())
}

async function teams(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeams()
}
export function getTeams() {
  return teams(cacheScope())
}

async function teamCatalog(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getCurrentTeamCatalog()
}
export function getCurrentTeamCatalog() {
  return teamCatalog(cacheScope())
}

async function teamMeta(scope: string, teamId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamMeta(teamId)
}
export function getTeamMeta(teamId: number) {
  return teamMeta(cacheScope(), teamId)
}

async function player(scope: string, steamid64: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getPlayerBySteamId64(steamid64)
}
export function getPlayerBySteamId64(steamid64: string) {
  return player(cacheScope(), steamid64)
}

async function leagueAverages(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getLeagueAverageStats()
}
export function getLeagueAverageStats() {
  return leagueAverages(cacheScope())
}

async function playerHistory(scope: string, steamid64: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getPlayerMatchHistory(steamid64)
}
export function getPlayerMatchHistory(steamid64: string) {
  return playerHistory(cacheScope(), steamid64)
}

async function futureOpponents(scope: string, teamId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getFutureOpponents(teamId)
}
export function getFutureOpponents(teamId: number) {
  return futureOpponents(cacheScope(), teamId)
}

async function teamMaps(scope: string, teamId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamMapStats(teamId)
}
export function getTeamMapStats(teamId: number) {
  return teamMaps(cacheScope(), teamId)
}

async function officialMatch(scope: string, matchId: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getMatchById(matchId)
}
export function getMatchById(matchId: string) {
  return officialMatch(cacheScope(), matchId)
}

async function matchKills(scope: string, matchId: number) {
  "use cache: remote"
  cacheLife("stable")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getMatchKills(matchId)
}
export function getMatchKills(matchId: number) {
  return matchKills(cacheScope(), matchId)
}

async function leaderboard(
  scope: string,
  stat: queries.LeaderboardStat,
  direction: queries.SortDirection,
  season: string,
  division: string,
  team: string,
  limit: number
) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getLeaderboard({
    stat,
    direction,
    season: season || undefined,
    division: division || undefined,
    team: team || undefined,
    limit: limit || undefined,
  })
}
export function getLeaderboard(filters: queries.LeaderboardFilters) {
  return leaderboard(
    cacheScope(),
    filters.stat,
    filters.direction ?? "desc",
    filters.season ?? "",
    filters.division ?? "",
    filters.team ?? "",
    filters.limit ?? 0
  )
}

async function standings(scope: string, season: string, division: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamStandings({
    season: season || undefined,
    division: division || undefined,
  })
}
export function getTeamStandings(
  filters: { season?: string; division?: string } = {}
) {
  return standings(cacheScope(), filters.season ?? "", filters.division ?? "")
}

async function teamOptions(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamOptions()
}
export function getTeamOptions() {
  return teamOptions(cacheScope())
}

async function teamByName(scope: string, name: string, season: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamByName(name, season || undefined)
}
export function getTeamByName(name: string, season?: string) {
  return teamByName(cacheScope(), name, season ?? "")
}

async function teamRoster(scope: string, teamId: number, scoped: boolean) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamRoster(teamId, scoped)
}
export function getTeamRoster(teamId: number, scoped = false) {
  return teamRoster(cacheScope(), teamId, scoped)
}

async function teamHistory(scope: string, teamId: number, scoped: boolean) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getTeamDemoMatches(teamId, scoped)
}
export function getTeamDemoMatches(teamId: number, scoped = false) {
  return teamHistory(cacheScope(), teamId, scoped)
}

async function matchTeams(scope: string, season: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getMatchTeams(season)
}
export function getMatchTeams(season: string) {
  return matchTeams(cacheScope(), season)
}

async function demoHistory(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getDemoMatches()
}
export function getDemoMatches() {
  return demoHistory(cacheScope())
}

async function demoMatch(scope: string, matchId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getDemoMatchById(matchId)
}
export function getDemoMatchById(matchId: number) {
  return demoMatch(cacheScope(), matchId)
}

async function demoPlayers(scope: string, matchId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getDemoMatchPlayerStats(matchId)
}
export function getDemoMatchPlayerStats(matchId: number) {
  return demoPlayers(cacheScope(), matchId)
}

async function demoRatingDetails(scope: string, matchId: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getDemoRatingDetails(matchId)
}
export function getDemoRatingDetails(matchId: number) {
  return demoRatingDetails(cacheScope(), matchId)
}

async function recentResults(scope: string, teamId: number, limit: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getRecentResults(teamId, limit)
}
export function getRecentResults(teamId: number, limit = 5) {
  return recentResults(cacheScope(), teamId, limit)
}

// Keep large player histories bounded by demo rather than one growing cache item.
async function playerKillMatches(scope: string, steamid64: string) {
  "use cache: remote"
  cacheLife("stable")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getPlayerKillMatchIds(steamid64)
}
async function playerKillsInMatch(
  scope: string,
  steamid64: string,
  matchId: number
) {
  "use cache: remote"
  cacheLife("stable")
  cacheTag(scopedCacheTag("db", scope))
  return queries.getPlayerKillsInMatch(steamid64, matchId)
}
export async function getPlayerKills(steamid64: string) {
  const scope = cacheScope()
  const matchIds = await playerKillMatches(scope, steamid64)
  return (
    await Promise.all(
      matchIds.map((id) => playerKillsInMatch(scope, steamid64, id))
    )
  ).flat()
}

async function faceitPlayers(scope: string, days: number, ids: string[] | null) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return Array.from(
    (await faceit.getFaceitPlayerStats(days, ids ?? undefined)).entries()
  )
}
/** All Faceit players, or only `steamid64s` (prefer this when rendering a
 * few players, so the cached entry and client payload stay small). */
export async function getFaceitPlayerStats(
  days = 7,
  steamid64s?: (string | null)[]
) {
  const ids = steamid64s
    ? [...new Set(steamid64s.filter((id) => id !== null))].sort()
    : null
  return new Map(await faceitPlayers(cacheScope(), days, ids))
}
/** Narrows a Faceit lookup to the given players before it is serialized to a
 * client component. */
export function pickFaceitStats<T>(
  stats: Map<string, T>,
  steamid64s: (string | null)[]
): Map<string, T> {
  return new Map(
    steamid64s.flatMap((id) => {
      const entry = id === null ? undefined : stats.get(id)
      return entry === undefined ? [] : [[id!, entry] as const]
    })
  )
}

async function faceitTeams(scope: string, days: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return Array.from((await faceit.getFaceitTeamStats(days)).entries())
}
export async function getFaceitTeamStats(days = 7) {
  return new Map(await faceitTeams(cacheScope(), days))
}

async function faceitPlayer(scope: string, steamid64: string, days: number) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("db", scope))
  return faceit.getFaceitPlayer(steamid64, days)
}
export function getFaceitPlayer(steamid64: string, days = 7) {
  return faceitPlayer(cacheScope(), steamid64, days)
}

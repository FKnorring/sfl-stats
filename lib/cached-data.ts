import { unstable_cache } from "next/cache"
import * as queries from "@/lib/db"
import * as faceit from "@/lib/faceit"
import { getCacheGeneration } from "@/lib/cache-generation"
import {
  CACHE_VERSION,
  CURRENT_DATA_SECONDS,
  STABLE_DATA_SECONDS,
  cacheScope,
  cacheTag,
} from "@/lib/cache-policy"

export type * from "@/lib/db"

function cachedQuery<Args extends unknown[], Result>(
  name: string,
  query: (...args: Args) => Promise<Result>,
  revalidate = CURRENT_DATA_SECONDS
) {
  return async (...args: Args): Promise<Result> => {
    const generation = await getCacheGeneration()
    return unstable_cache(
      query,
      [cacheScope(), CACHE_VERSION, name, generation],
      {
        revalidate,
        tags: [cacheTag("db")],
      }
    )(...args)
  }
}

export const getCurrentSeason = cachedQuery(
  "current-season",
  queries.getCurrentSeason
)
export const getSeasons = cachedQuery("seasons", queries.getSeasons)
export const getDivisions = cachedQuery("divisions", queries.getDivisions)
export const getTeams = cachedQuery("teams", queries.getTeams)
export const getCurrentTeamCatalog = cachedQuery(
  "team-catalog",
  queries.getCurrentTeamCatalog
)
export const getTeamMeta = cachedQuery("team-meta", queries.getTeamMeta)
export const getPlayerBySteamId64 = cachedQuery(
  "player",
  queries.getPlayerBySteamId64
)
export const getLeagueAverageStats = cachedQuery(
  "league-averages",
  queries.getLeagueAverageStats
)
export const getPlayerMatchHistory = cachedQuery(
  "player-history",
  queries.getPlayerMatchHistory
)
export const getFutureOpponents = cachedQuery(
  "future-opponents",
  queries.getFutureOpponents
)
export const getTeamMapStats = cachedQuery("team-maps", queries.getTeamMapStats)
export const getMatchById = cachedQuery("official-match", queries.getMatchById)
export const getMatchKills = cachedQuery(
  "match-kills",
  queries.getMatchKills,
  STABLE_DATA_SECONDS
)

const leaderboard = cachedQuery(
  "leaderboard",
  (
    stat: queries.LeaderboardStat,
    direction: queries.SortDirection,
    season: string,
    division: string,
    team: string
  ) =>
    queries.getLeaderboard({
      stat,
      direction,
      season: season || undefined,
      division: division || undefined,
      team: team || undefined,
    })
)
export function getLeaderboard(filters: queries.LeaderboardFilters) {
  return leaderboard(
    filters.stat,
    filters.direction ?? "desc",
    filters.season ?? "",
    filters.division ?? "",
    filters.team ?? ""
  )
}
const standings = cachedQuery("standings", (season: string) =>
  queries.getTeamStandings({ season: season || undefined })
)
export function getTeamStandings(filters: { season?: string } = {}) {
  return standings(filters.season ?? "")
}
const teamByName = cachedQuery("team-by-name", (name: string, season: string) =>
  queries.getTeamByName(name, season || undefined)
)
export function getTeamByName(name: string, season?: string) {
  return teamByName(name, season ?? "")
}
const teamRoster = cachedQuery(
  "team-roster",
  (teamId: number, scoped: boolean) => queries.getTeamRoster(teamId, scoped)
)
export function getTeamRoster(teamId: number, scoped = false) {
  return teamRoster(teamId, scoped)
}
const teamHistory = cachedQuery(
  "team-history",
  (teamId: number, scoped: boolean) =>
    queries.getTeamDemoMatches(teamId, scoped)
)
export function getTeamDemoMatches(teamId: number, scoped = false) {
  return teamHistory(teamId, scoped)
}
export const getMatchTeams = cachedQuery("match-teams", (season: string) =>
  queries.getMatchTeams(season)
)
export const getDemoMatches = cachedQuery("demo-history", () =>
  queries.getDemoMatches()
)
export const getDemoMatchById = cachedQuery("demo-match", (matchId: number) =>
  queries.getDemoMatchById(matchId)
)
export const getDemoMatchPlayerStats = cachedQuery(
  "demo-players",
  (matchId: number) => queries.getDemoMatchPlayerStats(matchId)
)
const recentResults = cachedQuery(
  "recent-results",
  (teamId: number, limit: number) => queries.getRecentResults(teamId, limit)
)
export function getRecentResults(teamId: number, limit = 5) {
  return recentResults(teamId, limit)
}

// Keep large player histories bounded by demo rather than one growing cache item.
const playerKillMatches = cachedQuery(
  "player-kill-matches",
  queries.getPlayerKillMatchIds,
  STABLE_DATA_SECONDS
)
const playerKillsInMatch = cachedQuery(
  "player-kills-in-match",
  queries.getPlayerKillsInMatch,
  STABLE_DATA_SECONDS
)
export async function getPlayerKills(steamid64: string) {
  const matchIds = await playerKillMatches(steamid64)
  return (
    await Promise.all(matchIds.map((id) => playerKillsInMatch(steamid64, id)))
  ).flat()
}

const faceitPlayers = cachedQuery("faceit-players", async (days: number) =>
  Array.from((await faceit.getFaceitPlayerStats(days)).entries())
)
export async function getFaceitPlayerStats(days = 7) {
  return new Map(await faceitPlayers(days))
}
const faceitTeams = cachedQuery("faceit-teams", async (days: number) =>
  Array.from((await faceit.getFaceitTeamStats(days)).entries())
)
export async function getFaceitTeamStats(days = 7) {
  return new Map(await faceitTeams(days))
}
const faceitPlayer = cachedQuery("faceit-player", faceit.getFaceitPlayer)
export function getFaceitPlayer(steamid64: string, days = 7) {
  return faceitPlayer(steamid64, days)
}

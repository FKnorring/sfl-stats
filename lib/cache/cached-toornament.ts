import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import * as source from "@/lib/toornament-live"
import type { MatchTeam } from "@/lib/matches"
import { cacheScope, scopedCacheTag } from "@/lib/cache-policy"

class UnavailableSchedule extends Error {}
async function scheduleMatches(scope: string, tournamentId: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("toornament", scope))
  const matches = await source.getLiveScheduleMatches(tournamentId)
  if (matches === null)
    throw new UnavailableSchedule("Toornament schedule unavailable")
  return matches
}
async function cachedDivisionStages(scope: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("toornament", scope))
  return source.getDivisionStages()
}
function divisionStages() {
  return cachedDivisionStages(cacheScope())
}
async function cachedRankingRows(scope: string, url: string) {
  "use cache: remote"
  cacheLife("current")
  cacheTag(scopedCacheTag("toornament", scope))
  return source.getRankingRows(url)
}
function rankingRows(url: string) {
  return cachedRankingRows(cacheScope(), url)
}

async function getLiveScheduleMatches(tournamentId: string) {
  // Unavailable-source UI must be retried at request time, not prerendered.
  await connection()
  try {
    return await scheduleMatches(cacheScope(), tournamentId)
  } catch (error) {
    if (!(error instanceof UnavailableSchedule)) throw error
    return null
  }
}

export async function getLivePendingMatches(
  tournamentId = source.TOURNAMENT_ID
) {
  const matches = await getLiveScheduleMatches(tournamentId)
  return matches?.filter((match) => match.status === "pending") ?? null
}

export async function getLiveDivisionResults(team: MatchTeam) {
  await connection()
  return source.getLiveDivisionResults(
    team,
    divisionStages,
    getLiveScheduleMatches
  )
}

export async function getLiveTeamPendingMatches(team: MatchTeam) {
  await connection()
  return source.getLiveTeamPendingMatches(
    team,
    divisionStages,
    getLivePendingMatches
  )
}

export async function getLiveDivisionStandings(
  team: MatchTeam,
  teams: MatchTeam[]
) {
  await connection()
  return source.getLiveDivisionStandings(
    team,
    teams,
    divisionStages,
    rankingRows
  )
}

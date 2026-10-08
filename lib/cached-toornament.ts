import { unstable_cache } from "next/cache"
import * as source from "@/lib/toornament-live"
import type { MatchTeam } from "@/lib/matches"
import { getCacheGeneration } from "@/lib/cache-generation"
import {
  CACHE_VERSION,
  CURRENT_DATA_SECONDS,
  cacheScope,
  cacheTag,
} from "@/lib/cache-policy"

const keys = [cacheScope(), CACHE_VERSION]
const options = {
  revalidate: CURRENT_DATA_SECONDS,
  tags: [cacheTag("toornament")],
}
class UnavailableSchedule extends Error {}
const pendingMatches = async (tournamentId?: string) => {
  const generation = await getCacheGeneration()
  return unstable_cache(
    async (id?: string) => {
      const matches = await source.getLivePendingMatches(id)
      if (matches === null)
        throw new UnavailableSchedule("Toornament schedule unavailable")
      return matches
    },
    [...keys, generation, "pending-matches"],
    options
  )(tournamentId)
}
const divisionStages = async () =>
  unstable_cache(
    source.getDivisionStages,
    [...keys, await getCacheGeneration(), "division-stages"],
    options
  )()
const rankingRows = async (url: string) =>
  unstable_cache(
    source.getRankingRows,
    [...keys, await getCacheGeneration(), "ranking-rows"],
    options
  )(url)

export async function getLivePendingMatches(tournamentId?: string) {
  try {
    return await pendingMatches(tournamentId)
  } catch (error) {
    if (!(error instanceof UnavailableSchedule)) throw error
    return null
  }
}

export function getLiveTeamPendingMatches(team: MatchTeam) {
  return source.getLiveTeamPendingMatches(
    team,
    divisionStages,
    getLivePendingMatches
  )
}

export function getLiveDivisionStandings(team: MatchTeam, teams: MatchTeam[]) {
  return source.getLiveDivisionStandings(
    team,
    teams,
    divisionStages,
    rankingRows
  )
}

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getLeaderboard,
  getCurrentSeason,
  getCurrentTeamCatalog,
} from "@/lib/cached-data"
import { getFaceitPlayerStats } from "@/lib/cached-data"
import { getPlayerSummaries } from "@/lib/steam-client"
import { LeaderboardView } from "./leaderboard-view"
import { RatingExplanation } from "@/components/player-rating"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Player leaderboard",
  description:
    "Compare SFL CS2 player performance across seasons and divisions.",
}

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Player leaderboard
      </h1>
      <Suspense fallback={<LeaderboardSkeleton />}>
        <LeaderboardResults />
      </Suspense>
    </div>
  )
}

async function LeaderboardResults() {
  // The board is scoped to the current season and ranked by kills on the
  // server. Division and team filtering happens in the browser, so the
  // full season is fetched once here rather than per filter selection.
  const season = (await getCurrentSeason()) ?? undefined

  const [leaderboardRows, teams, faceitStats] = await Promise.all([
    getLeaderboard({ stat: "kills", season }),
    getCurrentTeamCatalog(),
    getFaceitPlayerStats(),
  ])

  const steamSummaries = await getPlayerSummaries(
    leaderboardRows.map((row) => row.steamid64)
  )

  // Pre-join Faceit stats and Steam avatars into plain, serializable fields
  // — the lookup Maps themselves can't cross the server/client boundary
  // into the DataTable.
  const rows = leaderboardRows.map((row) => {
    const fs = faceitStats.get(row.steamid64)
    return {
      ...row,
      faceitElo: fs?.elo ?? null,
      faceitNickname: fs?.faceitNickname ?? null,
      faceitRecent:
        !fs || fs.matchesRecent === 0
          ? "—"
          : `${fs.matchesRecent} games, ${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`,
      avatarUrl: steamSummaries.get(row.steamid64)?.avatarUrl ?? null,
    }
  })

  return (
    <>
      <LeaderboardView rows={rows} teams={teams} />
      <RatingExplanation />
    </>
  )
}

import Link from "next/link"
import {
  getLeaderboard,
  getCurrentSeason,
  getSeasons,
  getDivisions,
  getTeams,
  type LeaderboardStat,
} from "@/lib/db"
import { getFaceitPlayerStats } from "@/lib/faceit"
import { getPlayerSummaries } from "@/lib/steam-client"
import {
  SeasonFilter,
  DivisionFilter,
  TeamFilter,
  StatFilter,
} from "@/components/leaderboard-filters"
import { LeaderboardTable } from "./leaderboard-table"

// DB reads aren't `fetch`-cached requests, so without this the leaderboard
// could get frozen at build time until the next deploy. force-dynamic keeps
// it fresh on every request, picking up the latest `pnpm ingest:demos` run.
export const dynamic = "force-dynamic"

const STAT_OPTIONS: { value: LeaderboardStat; label: string }[] = [
  { value: "kills", label: "Kills" },
  { value: "deaths", label: "Deaths" },
  { value: "adr", label: "ADR" },
  { value: "hs_pct", label: "HS%" },
  { value: "mvps", label: "MVPs" },
  { value: "assists", label: "Assists" },
]

const STAT_VALUES = new Set(STAT_OPTIONS.map((o) => o.value))

function isLeaderboardStat(
  value: string | undefined
): value is LeaderboardStat {
  return !!value && STAT_VALUES.has(value as LeaderboardStat)
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const statParam = Array.isArray(params.stat) ? params.stat[0] : params.stat
  const stat: LeaderboardStat = isLeaderboardStat(statParam)
    ? statParam
    : "kills"

  const seasonParam = Array.isArray(params.season)
    ? params.season[0]
    : params.season
  const divisionParam = Array.isArray(params.division)
    ? params.division[0]
    : params.division
  const teamParam = Array.isArray(params.team) ? params.team[0] : params.team

  const season = seasonParam ?? (await getCurrentSeason()) ?? undefined

  const [leaderboardRows, seasons, divisions, teams, faceitStats] =
    await Promise.all([
      getLeaderboard({
        stat,
        season,
        division: divisionParam,
        team: teamParam,
      }),
      getSeasons(),
      getDivisions(),
      getTeams(),
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
      faceitRecent:
        !fs || fs.matchesRecent === 0
          ? "—"
          : `${fs.matchesRecent} games, ${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`,
      avatarUrl: steamSummaries.get(row.steamid64)?.avatarUrl ?? null,
    }
  })

  const statLabel = STAT_OPTIONS.find((o) => o.value === stat)?.label

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Player leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          Svenska Företagsligan — aggregated from ingested demos, matched to
          scraped rosters.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatFilter stats={STAT_OPTIONS} value={stat} />
        <SeasonFilter seasons={seasons} value={season} />
        <DivisionFilter divisions={divisions} value={divisionParam} />
        <TeamFilter teams={teams} value={teamParam} />
        <Link
          href="/teams"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View team standings →
        </Link>
      </div>

      <LeaderboardTable rows={rows} stat={stat} statLabel={statLabel} />
    </div>
  )
}

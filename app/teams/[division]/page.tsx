import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getDivisions as getStaticDivisions } from "@/lib/db"
import {
  getTeamStandings,
  getCurrentSeason,
  getSeasons,
  getDivisions,
  getTeamByName,
} from "@/lib/cached-data"
import { getFaceitTeamStats } from "@/lib/cached-data"
import { SeasonFilter } from "@/components/leaderboard-filters"
import { DivisionTabs, TabsContent } from "@/components/division-tabs"
import {
  TeamCompareProvider,
  TeamCompareBar,
} from "@/components/team-compare-picker"
import type { TeamStandingTableRow } from "../columns"
import { TeamStandingsTable } from "../team-standings-table"

export async function generateStaticParams() {
  const divisions = await getStaticDivisions()
  return divisions.length
    ? divisions.map((division) => ({ division }))
    : [{ division: "__empty__" }]
}

export default async function TeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ division: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { division } = await params
  let activeDivision: string
  try {
    activeDivision = decodeURIComponent(division)
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    notFound()
  }
  const query = await searchParams
  const seasonParam = Array.isArray(query.season)
    ? query.season[0]
    : query.season

  const season = seasonParam ?? (await getCurrentSeason()) ?? undefined

  const [standingRows, seasons, divisions, faceitStats] = await Promise.all([
    getTeamStandings({ season }),
    getSeasons(),
    getDivisions(),
    getFaceitTeamStats(),
  ])
  if (!divisions.includes(activeDivision)) {
    const team = await getTeamByName(activeDivision)
    if (team) redirect(`/teams/team/${encodeURIComponent(team.teamName)}`)
    notFound()
  }

  // Pre-join Faceit stats into plain, serializable fields — the lookup Map
  // itself can't cross the server/client boundary into the DataTable.
  const rows: TeamStandingTableRow[] = standingRows.map((row) => {
    const fs = faceitStats.get(row.teamId)
    return {
      ...row,
      faceitAvgElo: fs?.avgElo ?? null,
      faceitRecent:
        !fs || fs.matchesRecent === 0
          ? "—"
          : `${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`,
    }
  })

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <SeasonFilter seasons={seasons} value={season} />
        <Link
          href="/leaderboard"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View player leaderboard →
        </Link>
      </div>

      <TeamCompareProvider>
        <DivisionTabs divisions={divisions} value={activeDivision}>
          <TabsContent value={activeDivision}>
            <TeamStandingsTable
              rows={rows.filter((row) => row.division === activeDivision)}
              emptyMessage="No teams found for this division."
            />
          </TabsContent>
        </DivisionTabs>
        <TeamCompareBar />
      </TeamCompareProvider>
    </div>
  )
}

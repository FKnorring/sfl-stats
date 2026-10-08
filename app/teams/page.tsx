import Link from "next/link"
import {
  getTeamStandings,
  getCurrentSeason,
  getSeasons,
  getDivisions,
} from "@/lib/cached-data"
import { getFaceitTeamStats } from "@/lib/cached-data"
import { SeasonFilter } from "@/components/leaderboard-filters"
import { DivisionTabs, TabsContent } from "@/components/division-tabs"
import {
  TeamCompareProvider,
  TeamCompareBar,
} from "@/components/team-compare-picker"
import type { TeamStandingTableRow } from "./columns"
import { TeamStandingsTable } from "./team-standings-table"

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const seasonParam = Array.isArray(params.season)
    ? params.season[0]
    : params.season
  const divisionParam = Array.isArray(params.division)
    ? params.division[0]
    : params.division

  const season = seasonParam ?? (await getCurrentSeason()) ?? undefined

  const [standingRows, seasons, divisions, faceitStats] = await Promise.all([
    getTeamStandings({ season }),
    getSeasons(),
    getDivisions(),
    getFaceitTeamStats(),
  ])

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

  const rowsByDivision = new Map<string, TeamStandingTableRow[]>()
  for (const row of rows) {
    const existing = rowsByDivision.get(row.division)
    if (existing) existing.push(row)
    else rowsByDivision.set(row.division, [row])
  }

  const activeDivision =
    divisionParam && divisions.includes(divisionParam)
      ? divisionParam
      : divisions[0]

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
        {activeDivision ? (
          <DivisionTabs divisions={divisions} value={activeDivision}>
            {divisions.map((division) => (
              <TabsContent key={division} value={division}>
                <TeamStandingsTable
                  rows={rowsByDivision.get(division) ?? []}
                  emptyMessage="No teams found for this division."
                />
              </TabsContent>
            ))}
          </DivisionTabs>
        ) : (
          <p className="text-sm text-muted-foreground">
            No teams found for this filter combination.
          </p>
        )}
        <TeamCompareBar />
      </TeamCompareProvider>
    </div>
  )
}

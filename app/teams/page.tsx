import Link from "next/link"
import {
  getTeamStandings,
  getCurrentSeason,
  getSeasons,
  getDivisions,
} from "@/lib/db"
import { getFaceitTeamStats } from "@/lib/faceit"
import { SeasonFilter } from "@/components/leaderboard-filters"
import { DivisionTabs, TabsContent } from "@/components/division-tabs"
import {
  TeamCompareProvider,
  TeamCompareBar,
} from "@/components/team-compare-picker"
import { DataTable } from "@/components/data-table/data-table"
import { teamStandingsColumns, type TeamStandingTableRow } from "./columns"

// Same reasoning as app/leaderboard/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

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
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Team standings</h1>
        <p className="text-sm text-muted-foreground">
          Ranked by official match results, with demo-derived stats as
          supplementary columns.
        </p>
      </div>

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
                <DataTable
                  columns={teamStandingsColumns}
                  data={rowsByDivision.get(division) ?? []}
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

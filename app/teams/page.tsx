import Link from "next/link"
import {
  getTeamStandings,
  getCurrentSeason,
  getSeasons,
  getDivisions,
} from "@/lib/db"
import { getFaceitTeamStats } from "@/lib/faceit"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SeasonFilter } from "@/components/leaderboard-filters"
import { DivisionTabs, TabsContent } from "@/components/division-tabs"
import {
  TeamCompareProvider,
  TeamCompareCheckbox,
  TeamCompareBar,
} from "@/components/team-compare-picker"
import type { TeamStandingRow } from "@/lib/db"

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

  const [rows, seasons, divisions, faceitStats] = await Promise.all([
    getTeamStandings({ season }),
    getSeasons(),
    getDivisions(),
    getFaceitTeamStats(),
  ])

  const rowsByDivision = new Map<string, TeamStandingRow[]>()
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
                <StandingsTable
                  rows={rowsByDivision.get(division) ?? []}
                  faceitStats={faceitStats}
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

function StandingsTable({
  rows,
  faceitStats,
}: {
  rows: TeamStandingRow[]
  faceitStats: Awaited<ReturnType<typeof getFaceitTeamStats>>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-12 w-10"></TableHead>
          <TableHead className="h-12 w-10">#</TableHead>
          <TableHead className="h-12">Team</TableHead>
          <TableHead className="h-12 text-right">W</TableHead>
          <TableHead className="h-12 text-right">L</TableHead>
          <TableHead className="h-12 text-right">Matches</TableHead>
          <TableHead className="h-12 text-right">Kills</TableHead>
          <TableHead className="h-12 text-right">Deaths</TableHead>
          <TableHead className="h-12 text-right">Avg Faceit Elo</TableHead>
          <TableHead className="h-12 text-right">Faceit (7d)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={row.teamId}>
            <TableCell className="py-3">
              <TeamCompareCheckbox
                teamId={row.teamId}
                teamName={row.teamName}
              />
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="py-3 font-medium">
              <Link
                href={`/teams/${encodeURIComponent(row.teamName)}`}
                className="flex items-center gap-2 underline-offset-4 hover:underline"
              >
                {row.logoUrl ? (
                  <img
                    src={row.logoUrl}
                    alt=""
                    className="size-8 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="size-8 rounded border border-border bg-muted" />
                )}
                {row.teamName}
              </Link>
            </TableCell>
            <TableCell className="py-3 text-right">{row.wins}</TableCell>
            <TableCell className="py-3 text-right">{row.losses}</TableCell>
            <TableCell className="py-3 text-right">{row.matchesPlayed}</TableCell>
            <TableCell className="py-3 text-right">{row.totalKills}</TableCell>
            <TableCell className="py-3 text-right">{row.totalDeaths}</TableCell>
            <TableCell className="py-3 text-right">
              {(() => {
                const fs = faceitStats.get(row.teamId)
                return fs?.avgElo != null ? Math.round(fs.avgElo) : "—"
              })()}
            </TableCell>
            <TableCell className="py-3 text-right">
              {(() => {
                const fs = faceitStats.get(row.teamId)
                if (!fs || fs.matchesRecent === 0) return "—"
                return `${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`
              })()}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={10}
              className="py-3 text-center text-muted-foreground"
            >
              No teams found for this division.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

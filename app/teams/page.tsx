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
import { Badge } from "@/components/ui/badge"
import { SeasonFilter, DivisionFilter } from "@/components/leaderboard-filters"
import {
  TeamCompareProvider,
  TeamCompareCheckbox,
  TeamCompareBar,
} from "@/components/team-compare-picker"

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

  const season = seasonParam ?? getCurrentSeason() ?? undefined

  const [rows, seasons, divisions, faceitStats] = [
    getTeamStandings({ season, division: divisionParam }),
    getSeasons(),
    getDivisions(),
    getFaceitTeamStats(),
  ]

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Team standings</h1>
        <p className="text-sm text-muted-foreground">
          Derived from matched roster players&apos; demo stats — no official
          W/D/L results yet.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SeasonFilter seasons={seasons} value={season} />
        <DivisionFilter divisions={divisions} value={divisionParam} />
        <Link
          href="/leaderboard"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View player leaderboard →
        </Link>
      </div>

      <TeamCompareProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Division</TableHead>
            <TableHead className="text-right">Roster</TableHead>
            <TableHead className="text-right">Matched</TableHead>
            <TableHead className="text-right">Matches</TableHead>
            <TableHead className="text-right">Kills</TableHead>
            <TableHead className="text-right">Deaths</TableHead>
            <TableHead className="text-right">Avg ADR</TableHead>
            <TableHead className="text-right">Avg Faceit Elo</TableHead>
            <TableHead className="text-right">Faceit (7d)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={row.teamId}>
              <TableCell>
                <TeamCompareCheckbox
                  teamId={row.teamId}
                  teamName={row.teamName}
                />
              </TableCell>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-medium">
                <Link
                  href={`/teams/${encodeURIComponent(row.teamName)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {row.teamName}
                </Link>
              </TableCell>
              <TableCell>{row.division}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {row.rosterSize}
                  {row.matchedPlayers < row.rosterSize ? (
                    <Badge variant="outline" className="text-amber-600">
                      {row.rosterSize - row.matchedPlayers} unmatched
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">{row.matchedPlayers}</TableCell>
              <TableCell className="text-right">{row.matchesPlayed}</TableCell>
              <TableCell className="text-right">{row.totalKills}</TableCell>
              <TableCell className="text-right">{row.totalDeaths}</TableCell>
              <TableCell className="text-right">
                {row.avgAdr != null ? row.avgAdr.toFixed(1) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {(() => {
                  const fs = faceitStats.get(row.teamId)
                  return fs?.avgElo != null ? Math.round(fs.avgElo) : "—"
                })()}
              </TableCell>
              <TableCell className="text-right">
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
                colSpan={12}
                className="text-center text-muted-foreground"
              >
                No teams found for this filter combination.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <TeamCompareBar />
      </TeamCompareProvider>
    </div>
  )
}

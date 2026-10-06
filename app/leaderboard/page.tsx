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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  SeasonFilter,
  DivisionFilter,
  TeamFilter,
  StatFilter,
} from "@/components/leaderboard-filters"

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

function formatStat(stat: LeaderboardStat, value: number): string {
  if (stat === "hs_pct") return `${(value * 100).toFixed(1)}%`
  if (stat === "adr") return value.toFixed(1)
  return String(Math.round(value))
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

  const [rows, seasons, divisions, teams, faceitStats] = await Promise.all([
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Division</TableHead>
            <TableHead className="text-right">Matches</TableHead>
            <TableHead className="text-right">K</TableHead>
            <TableHead className="text-right">D</TableHead>
            <TableHead className="text-right">A</TableHead>
            <TableHead className="text-right">ADR</TableHead>
            <TableHead className="text-right">HS%</TableHead>
            <TableHead className="text-right">
              {STAT_OPTIONS.find((o) => o.value === stat)?.label}
            </TableHead>
            <TableHead className="text-right">Faceit Elo</TableHead>
            <TableHead className="text-right">Faceit (7d)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={`${row.steamid64}-${row.teamName ?? "none"}`}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/players/${encodeURIComponent(row.steamid64)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.inGameName}
                  </Link>
                  {row.matchStatus &&
                  row.matchStatus !== "manual" &&
                  row.matchStatus !== "auto_high" ? (
                    <Badge variant="outline" className="text-amber-600">
                      {row.matchStatus === "auto_low"
                        ? "low-confidence match"
                        : row.matchStatus}
                    </Badge>
                  ) : null}
                  {!row.teamName ? (
                    <Badge variant="outline" className="text-destructive">
                      unmatched
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>{row.teamName ?? "—"}</TableCell>
              <TableCell>{row.division ?? "—"}</TableCell>
              <TableCell className="text-right">{row.matchesPlayed}</TableCell>
              <TableCell className="text-right">{row.kills}</TableCell>
              <TableCell className="text-right">{row.deaths}</TableCell>
              <TableCell className="text-right">{row.assists}</TableCell>
              <TableCell className="text-right">
                {row.adr != null ? row.adr.toFixed(1) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {row.hsPct != null ? `${(row.hsPct * 100).toFixed(1)}%` : "—"}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatStat(stat, row.statValue)}
              </TableCell>
              <TableCell className="text-right">
                {faceitStats.get(row.steamid64)?.elo ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {(() => {
                  const fs = faceitStats.get(row.steamid64)
                  if (!fs || fs.matchesRecent === 0) return "—"
                  return `${fs.matchesRecent} games, ${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`
                })()}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={13}
                className="text-center text-muted-foreground"
              >
                No matches found for this filter combination.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

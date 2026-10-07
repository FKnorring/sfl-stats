import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DivisionFilter } from "@/components/leaderboard-filters"
import {
  getDivisions,
  getMatchHistory,
  getTeamDirectory,
  type MatchHistoryRow,
} from "@/lib/db"
import { formatMapName } from "@/lib/map-images"
import { getToornamentSchedule } from "@/lib/toornament-client"

export const dynamic = "force-dynamic"

type UpcomingMatch = {
  matchId: string
  scheduledAt: string | null
  teamAName: string
  teamBName: string
  teamADivisions: string[]
  teamBDivisions: string[]
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "TBD"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatHistoryDivision(row: MatchHistoryRow): string {
  const unique = Array.from(
    new Set([row.teamADivision, row.teamBDivision].filter((d): d is string => !!d))
  )
  if (unique.length === 0) return "—"
  return unique.join(" / ")
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const divisionParam = Array.isArray(params.division)
    ? params.division[0]
    : params.division
  const teamParam = Array.isArray(params.team) ? params.team[0] : params.team
  const teamSearch = teamParam?.trim() ?? ""
  const teamSearchLower = teamSearch.toLowerCase()

  const divisions = await getDivisions()
  const division = divisionParam && divisions.includes(divisionParam) ? divisionParam : undefined

  const [teamDirectory, history] = await Promise.all([
    getTeamDirectory(),
    getMatchHistory({ division, teamSearch }),
  ])

  const divisionsByTeam = new Map<string, Set<string>>()
  for (const team of teamDirectory) {
    const key = team.name.toLowerCase()
    const existing = divisionsByTeam.get(key)
    if (existing) existing.add(team.division)
    else divisionsByTeam.set(key, new Set([team.division]))
  }

  let upcoming: UpcomingMatch[] = []
  let upcomingError = false
  try {
    const schedule = await getToornamentSchedule()
    upcoming = schedule
      .filter((m) => m.status === "pending")
      .map((m) => ({
        matchId: m.toornamentMatchId,
        scheduledAt: m.scheduledAt,
        teamAName: m.teamAName,
        teamBName: m.teamBName,
        teamADivisions: Array.from(
          divisionsByTeam.get(m.teamAName.toLowerCase()) ?? []
        ).sort(),
        teamBDivisions: Array.from(
          divisionsByTeam.get(m.teamBName.toLowerCase()) ?? []
        ).sort(),
      }))
      .filter((m) => {
        if (division) {
          const inDivision =
            m.teamADivisions.includes(division) || m.teamBDivisions.includes(division)
          if (!inDivision) return false
        }
        if (teamSearchLower) {
          return (
            m.teamAName.toLowerCase().includes(teamSearchLower) ||
            m.teamBName.toLowerCase().includes(teamSearchLower)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (!a.scheduledAt && !b.scheduledAt) return 0
        if (!a.scheduledAt) return 1
        if (!b.scheduledAt) return -1
        return a.scheduledAt.localeCompare(b.scheduledAt)
      })
  } catch {
    upcomingError = true
  }

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <DivisionFilter divisions={divisions} value={division} />
        <form action="/matches" method="get" className="flex items-center gap-2">
          {division ? <input type="hidden" name="division" value={division} /> : null}
          <Input
            type="search"
            name="team"
            placeholder="Search team"
            defaultValue={teamSearch}
            className="w-56"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Link
          href="/matches"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear filters
        </Link>
        <Link
          href="/teams"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View team standings →
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upcoming matches</h2>
        {upcomingError ? (
          <p className="text-sm text-muted-foreground">
            Could not load live Toornament matches right now.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming matches for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-3">
              {upcoming.map((match) => {
                const divisionLabel = Array.from(
                  new Set([...match.teamADivisions, ...match.teamBDivisions])
                ).join(" / ")

                return (
                  <Link
                    key={match.matchId}
                    href={`/matches/${encodeURIComponent(match.matchId)}`}
                    className="flex w-72 shrink-0 flex-col gap-1 rounded-md border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(match.scheduledAt)}
                    </p>
                    <p className="font-medium">{match.teamAName}</p>
                    <p className="text-sm text-muted-foreground">vs</p>
                    <p className="font-medium">{match.teamBName}</p>
                    {divisionLabel ? (
                      <Badge variant="outline" className="mt-1 w-fit">
                        {divisionLabel}
                      </Badge>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Match history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ingested demos for this filter.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Map</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row.matchId}>
                  <TableCell>{formatDate(row.demoDate)}</TableCell>
                  <TableCell>{formatHistoryDivision(row)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/matches/demo/${row.matchId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {(row.teamAName ?? "Unknown team")} vs{" "}
                      {(row.teamBName ?? "Unknown team")}
                    </Link>
                  </TableCell>
                  <TableCell>{formatMapName(row.mapName) ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {row.teamAScore != null && row.teamBScore != null
                      ? `${row.teamAScore}–${row.teamBScore}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

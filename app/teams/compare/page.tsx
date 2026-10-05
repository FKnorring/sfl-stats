import Link from "next/link"
import {
  getTeamStandings,
  getTeamMeta,
  getTeamRoster,
  type TeamMeta,
  type TeamRosterPlayerRow,
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
import { TeamSelect, type TeamOption } from "@/components/team-select"

// Same reasoning as app/teams/page.tsx and app/leaderboard/page.tsx — DB
// reads need per-request freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

function parseTeamId(
  value: string | string[] | undefined
): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  const id = Number(raw)
  return Number.isFinite(id) ? id : undefined
}

function RosterTable({
  roster,
  faceitStats,
}: {
  roster: TeamRosterPlayerRow[]
  faceitStats: Map<string, { elo: number | null }>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Matches</TableHead>
          <TableHead className="text-right">K</TableHead>
          <TableHead className="text-right">D</TableHead>
          <TableHead className="text-right">A</TableHead>
          <TableHead className="text-right">ADR</TableHead>
          <TableHead className="text-right">HS%</TableHead>
          <TableHead className="text-right">Faceit Elo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roster.map((row) => (
          <TableRow key={row.rosterEntryId}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {row.inGameName ?? row.nickname}
                {row.matchStatus !== "manual" &&
                row.matchStatus !== "auto_high" ? (
                  <Badge variant="outline" className="text-amber-600">
                    {row.matchStatus === "auto_low"
                      ? "low-confidence match"
                      : row.matchStatus === "unmatched"
                        ? "unmatched"
                        : row.matchStatus}
                  </Badge>
                ) : null}
              </div>
            </TableCell>
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
            <TableCell className="text-right">
              {row.steamid64
                ? faceitStats.get(row.steamid64)?.elo ?? "—"
                : "—"}
            </TableCell>
          </TableRow>
        ))}
        {roster.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={8}
              className="text-center text-muted-foreground"
            >
              No roster entries for this team.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function TeamColumn({
  slot,
  teams,
  teamId,
  meta,
  roster,
  faceitStats,
}: {
  slot: "teamA" | "teamB"
  teams: TeamOption[]
  teamId?: number
  meta: TeamMeta | null
  roster: TeamRosterPlayerRow[]
  faceitStats: Map<string, { elo: number | null }>
}) {
  return (
    <div className="flex flex-col gap-3">
      <TeamSelect
        paramName={slot}
        placeholder={slot === "teamA" ? "Team A" : "Team B"}
        teams={teams}
        value={teamId}
      />
      {meta ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">{meta.teamName}</h2>
          <p className="text-sm text-muted-foreground">
            {meta.division} — {meta.season}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pick a team above to see their roster.
        </p>
      )}
      {meta ? <RosterTable roster={roster} faceitStats={faceitStats} /> : null}
    </div>
  )
}

export default async function TeamComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const teamAId = parseTeamId(params.teamA)
  const teamBId = parseTeamId(params.teamB)

  const [standings, faceitStats] = await Promise.all([
    getTeamStandings({}),
    getFaceitPlayerStats(),
  ])

  const teamOptions: TeamOption[] = standings.map((t) => ({
    teamId: t.teamId,
    label: `${t.teamName} — ${t.division} (${t.season})`,
  }))

  const [metaA, metaB, rosterA, rosterB] = await Promise.all([
    teamAId != null ? getTeamMeta(teamAId) : null,
    teamBId != null ? getTeamMeta(teamBId) : null,
    teamAId != null ? getTeamRoster(teamAId) : [],
    teamBId != null ? getTeamRoster(teamBId) : [],
  ])

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Compare teams</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side rosters and demo stats for two teams.
        </p>
      </div>

      <Link
        href="/teams"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to standings
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        <TeamColumn
          slot="teamA"
          teams={teamOptions}
          teamId={teamAId}
          meta={metaA}
          roster={rosterA}
          faceitStats={faceitStats}
        />
        <TeamColumn
          slot="teamB"
          teams={teamOptions}
          teamId={teamBId}
          meta={metaB}
          roster={rosterB}
          faceitStats={faceitStats}
        />
      </div>
    </div>
  )
}

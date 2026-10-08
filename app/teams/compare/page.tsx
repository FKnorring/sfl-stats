import {
  getTeamStandings,
  getTeamMeta,
  getTeamRoster,
  type TeamMeta,
  type TeamRosterPlayerRow,
} from "@/lib/cached-data"
import { getFaceitPlayerStats } from "@/lib/cached-data"
import { TeamSelect, type TeamOption } from "@/components/team-select"
import { CompareRosterTable } from "./compare-roster-table"
import type { TeamRosterTableRow } from "@/components/team-roster-columns"

function parseTeamId(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  const id = Number(raw)
  return Number.isFinite(id) ? id : undefined
}

function RosterTable({
  teamId,
  roster,
  faceitStats,
}: {
  teamId: number
  roster: TeamRosterPlayerRow[]
  faceitStats: Map<string, { elo: number | null; faceitNickname: string }>
}) {
  const rows: TeamRosterTableRow[] = roster.map((row) => {
    const faceit = row.steamid64 ? faceitStats.get(row.steamid64) : undefined
    return {
      ...row,
      faceitElo: faceit?.elo ?? null,
      faceitNickname: faceit?.faceitNickname ?? null,
    }
  })

  return <CompareRosterTable teamId={teamId} rows={rows} />
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
  faceitStats: Map<string, { elo: number | null; faceitNickname: string }>
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
      {meta ? (
        <RosterTable
          teamId={meta.teamId}
          roster={roster}
          faceitStats={faceitStats}
        />
      ) : null}
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

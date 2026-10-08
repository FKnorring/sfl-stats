import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getTeamOptions,
  getTeamMeta,
  getTeamRoster,
  type TeamMeta,
  type TeamRosterPlayerRow,
} from "@/lib/cached-data"
import { getFaceitPlayerStats } from "@/lib/cached-data"
import { TeamSelect, type TeamOption } from "@/components/team-select"
import { CompareRosterTable } from "./compare-roster-table"
import type { TeamRosterTableRow } from "@/components/team-roster-columns"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Compare teams",
  description: "Compare SFL CS2 team rosters and player statistics.",
}

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

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined
}>

function CompareSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
      {[0, 1].map((slot) => (
        <div key={slot} className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function TeamComparePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Compare teams
      </h1>
      <Suspense fallback={<CompareSkeleton />}>
        <TeamCompareResults searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function TeamCompareResults({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const teamAId = parseTeamId(params.teamA)
  const teamBId = parseTeamId(params.teamB)

  const [teams, faceitStats, metaA, metaB, rosterA, rosterB] =
    await Promise.all([
      getTeamOptions(),
      getFaceitPlayerStats(),
      teamAId != null ? getTeamMeta(teamAId) : null,
      teamBId != null ? getTeamMeta(teamBId) : null,
      teamAId != null ? getTeamRoster(teamAId) : [],
      teamBId != null ? getTeamRoster(teamBId) : [],
    ])

  const teamOptions: TeamOption[] = teams.map((t) => ({
    teamId: t.teamId,
    label: `${t.teamName} — ${t.division} (${t.season})`,
  }))

  return (
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
  )
}

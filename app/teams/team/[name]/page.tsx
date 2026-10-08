import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { notFound } from "next/navigation"
import { getCurrentTeamCatalog } from "@/lib/db"
import {
  getTeamByName,
  getCurrentSeason,
  getTeamRoster,
  getFutureOpponents,
  getTeamMapStats,
  getTeamDemoMatches,
  getRecentResults,
} from "@/lib/cached-data"
import { getFaceitPlayerStats, pickFaceitStats } from "@/lib/cached-data"
import { TeamRosterTable } from "@/components/team-roster-table"
import { FutureOpponentsBar } from "@/components/future-opponents-bar"
import { TeamMapStats } from "@/components/team-map-stats"
import { TeamDemoMatches } from "@/components/team-demo-matches"
import { FollowTeamButton } from "@/components/follow-team-button"
import { TeamRecentForm } from "@/components/team-recent-form"
import {
  isNetlightTeam,
  NetlightEmbers,
  NetlightName,
} from "@/components/netlight-flames"

export async function generateStaticParams() {
  const teams = await getCurrentTeamCatalog()
  return teams.length
    ? [...new Set(teams.map((team) => team.teamName))].map((name) => ({ name }))
    : [{ name: "__empty__" }]
}

type TeamParams = Promise<{ name: string }>

function TeamPageSkeleton() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6" aria-busy="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function TeamPage({ params }: { params: TeamParams }) {
  return (
    <Suspense fallback={<TeamPageSkeleton />}>
      <TeamPageContent params={params} />
    </Suspense>
  )
}

async function TeamPageContent({ params }: { params: TeamParams }) {
  const { name } = await params
  const teamName = decodeURIComponent(name)

  const season = (await getCurrentSeason()) ?? undefined
  const meta = await getTeamByName(teamName, season)
  if (!meta) notFound()

  const [
    roster,
    faceitStats,
    futureOpponents,
    mapStats,
    demoMatches,
    recentResults,
  ] = await Promise.all([
    getTeamRoster(meta.teamId),
    getFaceitPlayerStats(),
    getFutureOpponents(meta.teamId),
    getTeamMapStats(meta.teamId),
    getTeamDemoMatches(meta.teamId),
    getRecentResults(meta.teamId),
  ])

  const isNetlight = isNetlightTeam(meta.teamName)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div
        className={`relative flex items-center gap-4 overflow-hidden rounded-md p-4 ${isNetlight ? "netlight-card border" : ""}`}
      >
        {isNetlight ? <NetlightEmbers /> : null}
        {meta.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the table it replaces: small, variable-source external logos
          <img
            src={meta.logoUrl}
            alt={meta.teamName}
            className="relative size-16 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="size-16 rounded-md border border-border bg-muted" />
        )}
        <div className="flex flex-col gap-1">
          {isNetlight ? (
            <NetlightName align="start">{meta.teamName}</NetlightName>
          ) : (
            <h1 className="text-lg font-medium">{meta.teamName}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {meta.division} — {meta.season}
          </p>
        </div>
        <div className="relative ml-auto">
          <FollowTeamButton teamName={meta.teamName} />
        </div>
      </div>

      <TeamRecentForm results={recentResults} />

      <FutureOpponentsBar opponents={futureOpponents} />

      <TeamRosterTable
        teamId={meta.teamId}
        teamName={meta.teamName}
        roster={roster}
        faceitStats={pickFaceitStats(
          faceitStats,
          roster.map((row) => row.steamid64)
        )}
      />

      <TeamMapStats maps={mapStats} />

      <TeamDemoMatches teamId={meta.teamId} matches={demoMatches} />
    </div>
  )
}

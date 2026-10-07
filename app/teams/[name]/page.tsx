import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getTeamByName,
  getCurrentSeason,
  getTeamRoster,
  getFutureOpponents,
  getTeamMapStats,
  getRecentResults,
} from "@/lib/db"
import { getFaceitPlayerStats } from "@/lib/faceit"
import { TeamRosterTable } from "@/components/team-roster-table"
import { FutureOpponentsBar } from "@/components/future-opponents-bar"
import { TeamMapStats } from "@/components/team-map-stats"
import { TeamRecentForm } from "@/components/team-recent-form"
import {
  isNetlightTeam,
  NetlightEmbers,
  NetlightName,
} from "@/components/netlight-flames"

// Same reasoning as app/teams/page.tsx and app/teams/compare/page.tsx — DB
// reads need per-request freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

export default async function TeamPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  const teamName = decodeURIComponent(name)

  const season = (await getCurrentSeason()) ?? undefined
  const meta = await getTeamByName(teamName, season)
  if (!meta) notFound()

  const [roster, faceitStats, futureOpponents, mapStats, recentResults] =
    await Promise.all([
      getTeamRoster(meta.teamId),
      getFaceitPlayerStats(),
      getFutureOpponents(meta.teamId),
      getTeamMapStats(meta.teamId),
      getRecentResults(meta.teamId),
    ])

  const isNetlight = isNetlightTeam(meta.teamName)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/teams"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to standings
      </Link>

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
      </div>

      <TeamRecentForm results={recentResults} />

      <FutureOpponentsBar opponents={futureOpponents} />

      <TeamRosterTable
        teamName={meta.teamName}
        roster={roster}
        faceitStats={faceitStats}
      />

      <TeamMapStats maps={mapStats} />
    </div>
  )
}

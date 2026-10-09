import Link from "next/link"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { notFound, redirect } from "next/navigation"
import { getDivisions as getStaticDivisions } from "@/lib/db"
import {
  getCurrentTeamCatalog,
  getDivisions,
  getTeamByName,
} from "@/lib/cached-data"
import { getFaceitTeamStats } from "@/lib/cached-data"
import { getLiveDivisionStandings } from "@/lib/cached-toornament"
import { DivisionTabs, TabsContent } from "@/components/division-tabs"
import {
  TeamCompareProvider,
  TeamCompareBar,
} from "@/components/team-compare-picker"
import type { TeamStandingTableRow } from "../columns"
import { TeamStandingsTable } from "../team-standings-table"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Division standings",
  description: "View SFL CS2 team standings by division and season.",
}

export async function generateStaticParams() {
  const divisions = await getStaticDivisions()
  return divisions.length
    ? divisions.map((division) => ({ division }))
    : [{ division: "__empty__" }]
}

type DivisionParams = Promise<{ division: string }>

function DivisionSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export default function TeamsPage({ params }: { params: DivisionParams }) {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Suspense fallback={<DivisionSkeleton />}>
        <DivisionStandings params={params} />
      </Suspense>
    </div>
  )
}

async function DivisionStandings({ params }: { params: DivisionParams }) {
  const { division } = await params
  let activeDivision: string
  try {
    activeDivision = decodeURIComponent(division)
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    notFound()
  }
  const [catalog, divisions, faceitStats] = await Promise.all([
    getCurrentTeamCatalog(),
    getDivisions(),
    getFaceitTeamStats(),
  ])
  if (!divisions.includes(activeDivision)) {
    const team = await getTeamByName(activeDivision)
    if (team) redirect(`/teams/team/${encodeURIComponent(team.teamName)}`)
    notFound()
  }

  // Any team in the division selects its Toornament stage (same as the home page).
  const representative = catalog.find((t) => t.division === activeDivision)
  const live = representative
    ? await getLiveDivisionStandings(representative, catalog)
    : null
  const logoById = new Map(catalog.map((t) => [t.teamId, t.logoUrl]))

  // Pre-join Faceit stats and logos into plain, serializable fields — the
  // lookup Maps themselves can't cross the server/client boundary.
  const rows: TeamStandingTableRow[] = (live?.rows ?? []).map((row) => {
    const fs = row.teamId === null ? undefined : faceitStats.get(row.teamId)
    return {
      ...row,
      logoUrl: row.teamId === null ? null : (logoById.get(row.teamId) ?? null),
      faceitAvgElo: fs?.avgElo ?? null,
      faceitRecent:
        !fs || fs.matchesRecent === 0
          ? "—"
          : `${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`,
    }
  })

  return (
    <>
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {activeDivision} standings
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        {live?.error ? (
          <p role="status" className="text-sm text-muted-foreground">
            {live.error}
          </p>
        ) : null}
        <Link
          href="/leaderboard"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View player leaderboard →
        </Link>
      </div>

      <TeamCompareProvider>
        <DivisionTabs divisions={divisions} value={activeDivision}>
          <TabsContent value={activeDivision}>
            <TeamStandingsTable
              rows={rows}
              emptyMessage={live?.error ?? "No teams found for this division."}
            />
            {live?.sourceUrl ? (
              <a
                href={live.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                Official Toornament ranking
              </a>
            ) : null}
          </TabsContent>
        </DivisionTabs>
        <TeamCompareBar />
      </TeamCompareProvider>
    </>
  )
}

import Link from "next/link"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { notFound } from "next/navigation"
import { db } from "@/lib/db/client"
import { toornamentMatches } from "@/lib/db/schema"
import { getMatchById } from "@/lib/cached-data"
import { Badge } from "@/components/ui/badge"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Match details",
  description: "View SFL CS2 match schedule, results, and team details.",
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "TBD"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function TeamLabel({ name, teamId }: { name: string; teamId: number | null }) {
  if (teamId == null) {
    return <span className="text-xl font-medium">{name}</span>
  }
  return (
    <Link
      href={`/teams/team/${encodeURIComponent(name)}`}
      className="text-xl font-medium underline-offset-4 hover:underline"
    >
      {name}
    </Link>
  )
}

export async function generateStaticParams() {
  const sample = await db
    .select({ matchId: toornamentMatches.toornamentMatchId })
    .from(toornamentMatches)
    .limit(1)
  return sample.length ? sample : [{ matchId: "__empty__" }]
}

type MatchParams = Promise<{ matchId: string }>

function MatchPageSkeleton() {
  return (
    <div className="flex min-h-64 flex-col gap-4 p-6" aria-busy="true">
      <Skeleton className="h-4 w-32 self-center" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-5 w-24 self-center" />
    </div>
  )
}

export default function MatchPage({ params }: { params: MatchParams }) {
  return (
    <Suspense fallback={<MatchPageSkeleton />}>
      <MatchPageContent params={params} />
    </Suspense>
  )
}

async function MatchPageContent({ params }: { params: MatchParams }) {
  const { matchId } = await params
  const match = await getMatchById(decodeURIComponent(matchId))
  if (!match) notFound()

  const isCompleted =
    match.status === "completed" &&
    match.teamAScore != null &&
    match.teamBScore != null

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatScheduledAt(match.scheduledAt)}</span>
          {match.roundLabel ? (
            <Badge variant="outline">{match.roundLabel}</Badge>
          ) : null}
        </div>

        <h1 className="flex flex-wrap items-center justify-center gap-3 py-6 text-center md:gap-6">
          <TeamLabel name={match.teamAName} teamId={match.teamAId} />
          {isCompleted ? (
            <span className="text-2xl font-semibold tabular-nums">
              {match.teamAScore}–{match.teamBScore}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">vs</span>
          )}
          <TeamLabel name={match.teamBName} teamId={match.teamBId} />
        </h1>

        {!isCompleted ? (
          <p className="text-center text-sm text-muted-foreground">
            {match.status === "running" ? "In progress" : "Scheduled"}
          </p>
        ) : null}
      </div>
    </div>
  )
}

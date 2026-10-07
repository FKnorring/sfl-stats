import Link from "next/link"
import { notFound } from "next/navigation"
import { getMatchById } from "@/lib/db"
import { Badge } from "@/components/ui/badge"

// Same reasoning as app/teams/[name]/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

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
      href={`/teams/${encodeURIComponent(name)}`}
      className="text-xl font-medium underline-offset-4 hover:underline"
    >
      {name}
    </Link>
  )
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  const match = await getMatchById(decodeURIComponent(matchId))
  if (!match) notFound()

  const isCompleted =
    match.status === "completed" &&
    match.teamAScore != null &&
    match.teamBScore != null

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/teams"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to standings
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatScheduledAt(match.scheduledAt)}</span>
          {match.roundLabel ? (
            <Badge variant="outline">{match.roundLabel}</Badge>
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-6 py-6">
          <TeamLabel name={match.teamAName} teamId={match.teamAId} />
          {isCompleted ? (
            <span className="text-2xl font-semibold tabular-nums">
              {match.teamAScore}–{match.teamBScore}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">vs</span>
          )}
          <TeamLabel name={match.teamBName} teamId={match.teamBId} />
        </div>

        {!isCompleted ? (
          <p className="text-center text-sm text-muted-foreground">
            {match.status === "running" ? "In progress" : "Scheduled"}
          </p>
        ) : null}
      </div>
    </div>
  )
}

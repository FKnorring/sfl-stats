import Link from "next/link"
import { notFound } from "next/navigation"
import { getDemoMatchById, getDemoMatchPlayerStats } from "@/lib/db"
import { getPlayerSummaries } from "@/lib/steam-client"
import { getMapImageUrl } from "@/lib/map-images"
import { DemoMatchTable } from "./demo-match-table"

// Same reasoning as app/teams/[name]/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

function TeamHeading({ name, score }: { name: string; score: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/teams/${encodeURIComponent(name)}`}
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        {name}
      </Link>
      {score != null ? (
        <span className="text-sm font-medium tabular-nums">{score}</span>
      ) : null}
    </div>
  )
}

export default async function DemoMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId: matchIdParam } = await params
  const matchId = Number(matchIdParam)
  if (!Number.isInteger(matchId)) notFound()

  const match = await getDemoMatchById(matchId)
  if (!match) notFound()

  const players = await getDemoMatchPlayerStats(matchId)
  const steamSummaries = await getPlayerSummaries(
    players.map((p) => p.steamid64)
  )

  // Pre-join Steam avatars into a plain, serializable field — the lookup
  // Map itself can't cross the server/client boundary into DemoMatchTable.
  const playersWithAvatars = players.map((p) => ({
    ...p,
    avatarUrl: steamSummaries.get(p.steamid64)?.avatarUrl ?? null,
  }))

  // `side` is just the in-game CT/T slot (CS2's team_num) — only useful
  // for splitting the roster into two groups, never as a display name.
  const sides = Array.from(
    new Set(players.map((p) => p.side).filter((s): s is string => !!s))
  )
  const [sideA, sideB] = sides
  const sideAPlayers = sideA
    ? playersWithAvatars.filter((p) => p.side === sideA)
    : playersWithAvatars
  const sideBPlayers = sideB
    ? playersWithAvatars.filter((p) => p.side === sideB)
    : []

  // Prefer the resolved roster team names on `matches` (set when ingestion
  // could pin exactly two distinct roster teams); otherwise fall back to
  // whichever roster team name is most common among this side's players.
  function majorityRosterTeamName(rows: typeof players): string | null {
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (!row.rosterTeamName) continue
      counts.set(row.rosterTeamName, (counts.get(row.rosterTeamName) ?? 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [name, count] of counts) {
      if (count > bestCount) {
        best = name
        bestCount = count
      }
    }
    return best
  }

  const teamAName =
    match.teamAName ?? majorityRosterTeamName(sideAPlayers) ?? "Team A"
  const teamBName =
    match.teamBName ?? majorityRosterTeamName(sideBPlayers) ?? "Team B"
  const mapImageUrl = getMapImageUrl(match.mapName)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/leaderboard"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to leaderboard
      </Link>

      <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-border py-20 text-center">
        {mapImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- stylized backdrop, decorative */}
            <img
              src={mapImageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/50 to-background/10" />
          </>
        ) : null}
        <div className="relative flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-4">
            <Link
              href={`/teams/${encodeURIComponent(teamAName)}`}
              className="text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamAName}
            </Link>
            {match.teamAScore != null && match.teamBScore != null ? (
              <span className="text-xl font-semibold tabular-nums">
                {match.teamAScore}–{match.teamBScore}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">vs</span>
            )}
            <Link
              href={`/teams/${encodeURIComponent(teamBName)}`}
              className="text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamBName}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold drop-shadow-sm">
            {match.mapName ?? "Unknown map"}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <TeamHeading name={teamAName} score={match.teamAScore} />
        <DemoMatchTable rows={sideAPlayers} />
      </div>

      <div className="flex flex-col gap-2">
        <TeamHeading name={teamBName} score={match.teamBScore} />
        <DemoMatchTable rows={sideBPlayers} />
      </div>
    </div>
  )
}

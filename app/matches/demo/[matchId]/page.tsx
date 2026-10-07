import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getDemoMatchById,
  getDemoMatchPlayerStats,
  getMatchKills,
} from "@/lib/db"
import { getPlayerSummaries } from "@/lib/steam-client"
import { formatMapName, getMapImageUrl, getMapRadar } from "@/lib/map-images"
import { Badge } from "@/components/ui/badge"
import { DemoMatchTable } from "./demo-match-table"
import { PlayerHeatmaps } from "./player-heatmaps"

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
  const kills = await getMatchKills(matchId)
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
  const radar = getMapRadar(match.mapName)

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
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {match.teamALogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={match.teamALogoUrl}
                alt=""
                className="size-16 justify-self-end rounded-md border border-border object-cover drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-end rounded-md border border-border bg-muted" />
            )}
            <div />
            {match.teamBLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={match.teamBLogoUrl}
                alt=""
                className="size-16 justify-self-start rounded-md border border-border object-cover drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-start rounded-md border border-border bg-muted" />
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Link
              href={`/teams/${encodeURIComponent(teamAName)}`}
              className="justify-self-end text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamAName}
            </Link>
            {match.teamAScore != null && match.teamBScore != null ? (
              <span className="justify-self-center text-xl font-semibold tabular-nums">
                {match.teamAScore}–{match.teamBScore}
              </span>
            ) : (
              <span className="justify-self-center text-sm text-muted-foreground">
                vs
              </span>
            )}
            <Link
              href={`/teams/${encodeURIComponent(teamBName)}`}
              className="justify-self-start text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamBName}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold drop-shadow-sm">
            {formatMapName(match.mapName) ?? "Unknown map"}
          </h1>
          {match.teamResolutionConflict ? (
            <Badge
              variant="outline"
              className="text-amber-600"
              title={match.teamResolutionConflict}
            >
              team identity needs review
            </Badge>
          ) : null}
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

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Player heatmaps</h2>
        <PlayerHeatmaps
          players={players.map((p) => ({
            steamid64: p.steamid64,
            name: p.inGameName,
          }))}
          kills={kills}
          mapImageUrl={mapImageUrl}
          radar={radar}
        />
      </div>
    </div>
  )
}

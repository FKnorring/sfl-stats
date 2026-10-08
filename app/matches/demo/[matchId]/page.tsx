import Link from "next/link"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import {
  getDemoMatchById,
  getDemoMatchPlayerStats,
  getMatchKills,
} from "@/lib/cached-data"
import { getPlayerSummaries } from "@/lib/steam-client"
import { formatMapName, getMapImageUrl, getMapRadar } from "@/lib/map-images"
import { Badge } from "@/components/ui/badge"
import { isNetlightTeam } from "@/components/netlight-flames"
import { isLocalEnv } from "@/lib/env"
import { DemoMatchView } from "./demo-match-view"

export default async function DemoMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  await connection()
  const { matchId: matchIdParam } = await params
  const matchId = Number(matchIdParam)
  if (!Number.isInteger(matchId)) notFound()

  const match = await getDemoMatchById(matchId)
  if (!match) notFound()

  const [players, rawKills] = await Promise.all([
    getDemoMatchPlayerStats(matchId),
    getMatchKills(matchId),
  ])
  const steamSummaries = await getPlayerSummaries(
    players.map((p) => p.steamid64)
  )

  // Netlight heatmap data stays server-side outside ENV=local: positions of
  // their players are blanked before anything is serialized to the client.
  const hiddenSteamids = isLocalEnv
    ? []
    : players
        .filter((p) => isNetlightTeam(p.rosterTeamName))
        .map((p) => p.steamid64)
  const hidden = new Set(hiddenSteamids)
  const kills = rawKills.map((k) => ({
    ...k,
    ...(k.attackerSteamid64 && hidden.has(k.attackerSteamid64)
      ? { attackerX: null, attackerY: null }
      : null),
    ...(hidden.has(k.victimSteamid64)
      ? { victimX: null, victimY: null }
      : null),
  }))

  // Pre-join Steam avatars into a plain, serializable field — the lookup
  // Map itself can't cross the server/client boundary into DemoMatchTable.
  const playersWithAvatars = players.map((p) => ({
    ...p,
    avatarUrl: steamSummaries.get(p.steamid64)?.avatarUrl ?? null,
  }))

  // `side` is just the in-game CT/T slot (CS2's team_num) — only useful
  // for splitting the roster into two groups, never as a display name.
  const sideA = match.teamASide
  const sideB = match.teamBSide
  const sideAPlayers = sideA
    ? playersWithAvatars.filter((p) => p.side === sideA)
    : []
  const sideBPlayers = sideB
    ? playersWithAvatars.filter((p) => p.side === sideB)
    : []
  const unassignedPlayers = playersWithAvatars.filter(
    (p) => !sideAPlayers.includes(p) && !sideBPlayers.includes(p)
  )

  const teamAName = match.teamAName ?? "Unknown team A"
  const teamBName = match.teamBName ?? "Unknown team B"
  const { teamALogoUrl, teamBLogoUrl, teamAScore, teamBScore } = match
  const mapImageUrl = getMapImageUrl(match.mapName)
  const radar = getMapRadar(match.mapName)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
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
          {/* Single grid (not two stacked ones) so the logo and name rows
              share the same column widths and stay aligned on the same
              center axis as the vs/score, no matter how wide "vs" vs the
              score text is. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-8 gap-y-2">
            {teamALogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={teamALogoUrl}
                alt=""
                // bg-card (not bg-muted, which is shared with the no-logo
                // placeholder) so a logo with a transparent background
                // still reads against light and dark themes alike.
                className="size-16 justify-self-end rounded-md border border-border bg-card object-contain p-1.5 drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-end rounded-md border border-border bg-muted" />
            )}
            <div />
            {teamBLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={teamBLogoUrl}
                alt=""
                className="size-16 justify-self-start rounded-md border border-border bg-card object-contain p-1.5 drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-start rounded-md border border-border bg-muted" />
            )}
            <Link
              href={`/teams/${encodeURIComponent(teamAName)}`}
              className="justify-self-end text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamAName}
            </Link>
            {teamAScore != null && teamBScore != null ? (
              <span className="justify-self-center text-xl font-semibold tabular-nums">
                {teamAScore}–{teamBScore}
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
          {match.scoreSource === "official" ? (
            <Badge
              variant="secondary"
              title="Toornament result; may describe a series rather than this demo"
            >
              Official result
            </Badge>
          ) : null}
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

      <DemoMatchView
        teamA={{ name: teamAName, score: teamAScore, players: sideAPlayers }}
        teamB={{ name: teamBName, score: teamBScore, players: sideBPlayers }}
        unassignedPlayers={unassignedPlayers}
        kills={kills}
        hiddenSteamids={hiddenSteamids}
        mapImageUrl={mapImageUrl}
        radar={radar}
      />
    </div>
  )
}

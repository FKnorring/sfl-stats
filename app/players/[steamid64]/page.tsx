import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getPlayerBySteamId64,
  getPlayerRosterHistory,
  getPlayerMatchHistory,
} from "@/lib/db"
import { getFaceitPlayerStats } from "@/lib/faceit"
import { getPlayerSummary } from "@/lib/steam-client"
import { Badge } from "@/components/ui/badge"
import { ProfileLinks } from "@/components/profile-links"
import { TeamHistoryTable, MatchHistoryTable } from "./player-history-tables"

// Same reasoning as app/teams/[name]/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ steamid64: string }>
}) {
  const { steamid64: steamid64Param } = await params
  const steamid64 = decodeURIComponent(steamid64Param)

  const player = await getPlayerBySteamId64(steamid64)
  if (!player) notFound()

  const [rosterHistory, matchHistory, faceitStats, steamSummary] =
    await Promise.all([
      getPlayerRosterHistory(steamid64),
      getPlayerMatchHistory(steamid64),
      getFaceitPlayerStats(),
      getPlayerSummary(steamid64).catch(() => null),
    ])

  const faceit = faceitStats.get(steamid64)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/leaderboard"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to leaderboard
      </Link>

      <div className="flex items-center gap-4">
        {steamSummary?.avatarUrl ? (
          <img
            src={steamSummary.avatarUrl}
            alt={player.inGameName}
            className="size-16 rounded-md border border-border"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            ?
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">{player.inGameName}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ProfileLinks
              steamid64={steamid64}
              faceitNickname={faceit?.faceitNickname}
            />
            {faceit?.elo != null ? (
              <Badge variant="outline">{faceit.elo} elo</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 rounded-md border border-border p-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Matches</span>
          <span className="font-medium">{player.matchesPlayed}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Kills</span>
          <span className="font-medium">{player.kills}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Deaths</span>
          <span className="font-medium">{player.deaths}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Assists</span>
          <span className="font-medium">{player.assists}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Avg ADR</span>
          <span className="font-medium">
            {player.adr != null ? player.adr.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">HS%</span>
          <span className="font-medium">
            {player.hsPct != null ? `${(player.hsPct * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">MVPs</span>
          <span className="font-medium">{player.mvps}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Team history
        </h2>
        <TeamHistoryTable rows={rosterHistory} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Match history
        </h2>
        <MatchHistoryTable rows={matchHistory} />
      </div>
    </div>
  )
}

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { notFound } from "next/navigation"
import { db } from "@/lib/db/client"
import { players } from "@/lib/db/schema"
import {
  getLeagueAverageStats,
  getPlayerBySteamId64,
  getPlayerKills,
  getPlayerMatchHistory,
} from "@/lib/cached-data"
import { getFaceitPlayer } from "@/lib/cached-data"
import { getPlayerSummary } from "@/lib/steam-client"
import { Badge } from "@/components/ui/badge"
import { ProfileLinks } from "@/components/profile-links"
import { StatValue } from "@/components/stat-value"
import {
  isNetlightTeam,
  NetlightEmbers,
  NetlightName,
} from "@/components/netlight-flames"
import { MatchHistoryTable } from "./player-history-tables"
import { isLocalEnv } from "@/lib/env"
import { NetlightHeatmapGate } from "./netlight-heatmap-gate"
import { PlayerMapHeatmap } from "./player-map-heatmap"
import { getMapRadar } from "@/lib/map-images"
import { RatingValue, RatingExplanation } from "@/components/player-rating"

export async function generateStaticParams() {
  const sample = await db
    .select({ steamid64: players.steamid64 })
    .from(players)
    .limit(1)
  return sample.length ? sample : [{ steamid64: "__empty__" }]
}

type PlayerParams = Promise<{ steamid64: string }>

function PlayerPageSkeleton() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6" aria-busy="true">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex w-72 shrink-0 flex-col gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="min-h-96 min-w-0 flex-1" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function PlayerPage({ params }: { params: PlayerParams }) {
  return (
    <Suspense fallback={<PlayerPageSkeleton />}>
      <PlayerPageContent params={params} />
    </Suspense>
  )
}

async function PlayerPageContent({ params }: { params: PlayerParams }) {
  const { steamid64: steamid64Param } = await params
  const steamid64 = decodeURIComponent(steamid64Param)

  const player = await getPlayerBySteamId64(steamid64)
  if (!player) notFound()

  const [matchHistory, faceit, steamSummary, leagueAverage] = await Promise.all(
    [
      getPlayerMatchHistory(steamid64),
      getFaceitPlayer(steamid64),
      getPlayerSummary(steamid64).catch(() => null),
      getLeagueAverageStats(),
    ]
  )

  const isNetlight = matchHistory.some((m) => isNetlightTeam(m.teamName))
  // Netlight kill data stays server-side on prod until unlocked via action.
  const playerKills =
    isNetlight && !isLocalEnv ? [] : await getPlayerKills(steamid64)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex w-72 shrink-0 flex-col gap-4">
          <div
            className={`relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-md border border-border p-8 text-center ${isNetlight ? "netlight-card" : ""}`}
          >
            {isNetlight ? <NetlightEmbers /> : null}
            {steamSummary?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small, variable-source external avatar, same tradeoff as team logos
              <img
                src={steamSummary.avatarUrl}
                alt={player.inGameName}
                className="size-40 rounded-md border border-border"
              />
            ) : (
              <div className="flex size-40 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                ?
              </div>
            )}
            <div className="flex flex-col gap-1">
              {isNetlight ? (
                <NetlightName>{player.inGameName}</NetlightName>
              ) : (
                <h1 className="text-lg font-medium">{player.inGameName}</h1>
              )}
              <span className="text-sm text-muted-foreground">
                {player.realName ?? "😂"}
              </span>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <ProfileLinks
                  steamid64={steamid64}
                  faceitNickname={faceit?.faceitNickname}
                />
                {faceit?.elo != null ? (
                  <Badge variant="outline">{faceit.elo} elo</Badge>
                ) : null}
                {faceit?.skillLevel != null ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs from /public
                  <img
                    src={`/faceit-levels/${faceit.skillLevel}.svg`}
                    alt={`Faceit level ${faceit.skillLevel}`}
                    title={`Faceit level ${faceit.skillLevel}`}
                    className="size-6"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 content-center gap-6 rounded-md border border-border p-8 text-sm">
            <div className="col-span-2 flex flex-col gap-0.5">
              <span className="text-muted-foreground">SFL Rating</span>
              <span className="font-medium">
                <RatingValue
                  rating={player.rating}
                  ratedGames={player.ratedGames}
                  matchesPlayed={player.matchesPlayed}
                  teamName={matchHistory[0]?.teamName}
                />
              </span>
              <RatingExplanation />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Matches</span>
              <span className="font-medium">{player.matchesPlayed}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">KDA</span>
              <span className="font-medium">
                <StatValue
                  value={player.kda}
                  average={leagueAverage.avgKda}
                  format={(v) => v.toFixed(2)}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Kills</span>
              <span className="font-medium">
                <StatValue
                  value={player.matchesPlayed > 0 ? player.kills : null}
                  average={
                    player.matchesPlayed > 0
                      ? leagueAverage.avgKillsPerMatch * player.matchesPlayed
                      : null
                  }
                  format={() => String(player.kills)}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Deaths</span>
              <span className="font-medium">
                <StatValue
                  value={player.matchesPlayed > 0 ? player.deaths : null}
                  average={
                    player.matchesPlayed > 0
                      ? leagueAverage.avgDeathsPerMatch * player.matchesPlayed
                      : null
                  }
                  invert
                  format={() => String(player.deaths)}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Assists</span>
              <span className="font-medium">
                <StatValue
                  value={player.matchesPlayed > 0 ? player.assists : null}
                  average={
                    player.matchesPlayed > 0
                      ? leagueAverage.avgAssistsPerMatch * player.matchesPlayed
                      : null
                  }
                  format={() => String(player.assists)}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Avg ADR</span>
              <span className="font-medium">
                <StatValue
                  value={player.adr}
                  average={leagueAverage.avgAdr}
                  format={(v) => v.toFixed(1)}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">HS%</span>
              <span className="font-medium">
                <StatValue
                  value={player.hsPct}
                  average={leagueAverage.avgHsPct}
                  format={(v) => `${(v * 100).toFixed(1)}%`}
                />
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">MVPs</span>
              <span className="font-medium">
                <StatValue
                  value={player.matchesPlayed > 0 ? player.mvps : null}
                  average={
                    player.matchesPlayed > 0
                      ? leagueAverage.avgMvpsPerMatch * player.matchesPlayed
                      : null
                  }
                  format={() => String(player.mvps)}
                />
              </span>
            </div>
          </div>
        </div>

        {isNetlight && !isLocalEnv ? (
          <NetlightHeatmapGate steamid64={steamid64} />
        ) : (
          <PlayerMapHeatmap
            steamid64={steamid64}
            kills={playerKills.filter((k) => getMapRadar(k.mapName) != null)}
            radars={Object.fromEntries(
              [...new Set(playerKills.map((k) => k.mapName))].flatMap((m) => {
                const r = getMapRadar(m)
                return r ? [[m, r]] : []
              })
            )}
          />
        )}
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

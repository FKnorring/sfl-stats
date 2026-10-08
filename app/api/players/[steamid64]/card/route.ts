import { getPlayerBySteamId64, getPlayerMatchHistory } from "@/lib/cached-data"
import { getFaceitPlayer } from "@/lib/cached-data"
import { getPlayerSummary } from "@/lib/steam-client"
import { withCacheGeneration } from "@/lib/cache-generation"

const RECENT_GAMES = 5

export type PlayerCardData = {
  steamid64: string
  inGameName: string
  realName: string | null
  teamName: string | null
  avatarUrl: string | null
  steamPersonaName: string | null
  faceit: {
    nickname: string
    elo: number | null
    skillLevel: number | null
  } | null
  recentGames: {
    matchId: number
    mapName: string | null
    demoDate: string | null
    opponentTeamName: string | null
    kills: number
    deaths: number
    assists: number
    adr: number | null
  }[]
}

/**
 * Lazy payload for the player hover card (components/player-hover-card.tsx),
 * fetched on first hover so tables don't pay for it per row up front.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/players/[steamid64]/card">
) {
  return withCacheGeneration(async () => {
    const { steamid64 } = await ctx.params
    const player = await getPlayerBySteamId64(steamid64)
    if (!player)
      return Response.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      )

    const [steam, faceit, history] = await Promise.all([
      getPlayerSummary(steamid64),
      getFaceitPlayer(steamid64),
      getPlayerMatchHistory(steamid64),
    ])

    const data: PlayerCardData = {
      steamid64,
      inGameName: player.inGameName,
      realName: player.realName,
      teamName: history.find((h) => h.teamName)?.teamName ?? null,
      avatarUrl: steam?.avatarUrl ?? null,
      steamPersonaName: steam?.personaName ?? null,
      faceit: faceit
        ? {
            nickname: faceit.faceitNickname,
            elo: faceit.elo,
            skillLevel: faceit.skillLevel,
          }
        : null,
      recentGames: history.slice(0, RECENT_GAMES).map((h) => ({
        matchId: h.matchId,
        mapName: h.mapName,
        demoDate: h.demoDate,
        opponentTeamName: h.opponentTeamName,
        kills: h.kills,
        deaths: h.deaths,
        assists: h.assists,
        adr: h.adr,
      })),
    }

    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  })
}

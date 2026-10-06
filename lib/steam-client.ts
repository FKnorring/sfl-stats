import { z } from "zod"

// Steam Web API, authenticated with a single key param (not a bearer token).
// Generate one at https://steamcommunity.com/dev/apikey.
const STEAM_API_BASE = "https://api.steampowered.com"

function getApiKey(): string | null {
  return process.env.STEAM_API_KEY ?? null
}

const playerSummarySchema = z
  .object({
    steamid: z.string(),
    personaname: z.string().optional(),
    avatarfull: z.string().optional(),
  })
  .passthrough()

const playerSummariesResponseSchema = z.object({
  response: z.object({
    players: z.array(playerSummarySchema),
  }),
})

export type SteamPlayerSummary = {
  steamid64: string
  personaName: string | null
  avatarUrl: string | null
}

/**
 * GET ISteamUser/GetPlayerSummaries - live per-request lookup, no caching.
 * Returns null on any failure (missing key, private profile, network error,
 * unexpected response shape) so a player page always renders without a
 * picture rather than erroring.
 */
export async function getPlayerSummary(
  steamid64: string
): Promise<SteamPlayerSummary | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${encodeURIComponent(steamid64)}`
    const res = await fetch(url)
    if (!res.ok) return null

    const json = await res.json()
    const parsed = playerSummariesResponseSchema.parse(json)
    const player = parsed.response.players[0]
    if (!player) return null

    return {
      steamid64: player.steamid,
      personaName: player.personaname ?? null,
      avatarUrl: player.avatarfull ?? null,
    }
  } catch (err) {
    console.warn(`[steam-client] failed to fetch summary for ${steamid64}:`, err)
    return null
  }
}

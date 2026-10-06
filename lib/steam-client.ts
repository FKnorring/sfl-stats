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
  const map = await getPlayerSummaries([steamid64])
  return map.get(steamid64) ?? null
}

/**
 * Batched GetPlayerSummaries lookup - Steam accepts up to 100 steamids per
 * request (comma-separated), so a page listing many players (e.g. the
 * leaderboard) should use this instead of one request per row. Returns an
 * empty map on any failure, same fail-open behavior as getPlayerSummary.
 */
export async function getPlayerSummaries(
  steamid64s: string[]
): Promise<Map<string, SteamPlayerSummary>> {
  const result = new Map<string, SteamPlayerSummary>()
  const key = getApiKey()
  if (!key || steamid64s.length === 0) return result

  const uniqueIds = Array.from(new Set(steamid64s))

  try {
    for (let i = 0; i < uniqueIds.length; i += 100) {
      const batch = uniqueIds.slice(i, i + 100)
      const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${encodeURIComponent(batch.join(","))}`
      const res = await fetch(url)
      if (!res.ok) continue

      const json = await res.json()
      const parsed = playerSummariesResponseSchema.parse(json)
      for (const player of parsed.response.players) {
        result.set(player.steamid, {
          steamid64: player.steamid,
          personaName: player.personaname ?? null,
          avatarUrl: player.avatarfull ?? null,
        })
      }
    }
  } catch (err) {
    console.warn(`[steam-client] failed to fetch player summaries:`, err)
  }

  return result
}

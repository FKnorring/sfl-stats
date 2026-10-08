import { z } from "zod"
import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { cacheScope, scopedCacheTag } from "@/lib/cache-policy"

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
 * GET ISteamUser/GetPlayerSummaries, using the shared successful-batch cache.
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

  // Keep optional-source failures out of the prerendered shell.
  await connection()
  const uniqueIds = Array.from(new Set(steamid64s))
  uniqueIds.sort()
  const batches: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += 100)
    batches.push(uniqueIds.slice(i, i + 100))
  const scope = cacheScope()
  const results = await Promise.all(
    batches.map((ids) =>
      cachedBatch(scope, ids).catch((err) => {
        console.warn("[steam-client] failed to fetch player summaries:", err)
        return []
      })
    )
  )
  for (const player of results.flat()) result.set(player.steamid64, player)
  return result
}

export async function fetchPlayerSummaryBatch(
  ids: string[]
): Promise<SteamPlayerSummary[]> {
  const key = getApiKey()
  if (!key) throw new Error("STEAM_API_KEY is not configured")
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${encodeURIComponent(ids.join(","))}`
  let response: Response
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // Do not include fetch errors that may contain the API-key-bearing URL.
    throw new Error("Steam player-summary request failed")
  }
  if (!response.ok)
    throw new Error(`Steam player summaries: HTTP ${response.status}`)
  const parsed = playerSummariesResponseSchema.parse(await response.json())
  return parsed.response.players.map((player) => ({
    steamid64: player.steamid,
    personaName: player.personaname ?? null,
    avatarUrl: player.avatarfull ?? null,
  }))
}

async function cachedBatch(scope: string, ids: string[]) {
  "use cache: remote"
  cacheLife("stable")
  cacheTag(scopedCacheTag("steam", scope))
  return fetchPlayerSummaryBatch(ids)
}

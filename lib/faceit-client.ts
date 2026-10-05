import { z } from "zod"

// Server-side Data API, authenticated with a single bearer API key
// (Authorization: Bearer <key>), generated in Faceit's App Studio under
// "API Keys". This is NOT the APPID/SECRET pair used for Faceit Connect
// (OAuth2 login-on-behalf-of-a-user) - those credentials don't work here.
const FACEIT_API_BASE = "https://open.faceit.com/data/v4"

function getApiKey(): string {
  const key = process.env.FACEIT_API_KEY
  if (!key) {
    throw new Error(
      "FACEIT_API_KEY is not set. Generate a server-side API Key in Faceit's " +
        "App Studio (API Keys panel) and put it in .env as FACEIT_API_KEY."
    )
  }
  return key
}

/** Faceit returns some numeric stats as strings (e.g. "K/D Ratio": "1.23"). */
export function parseNumericStat(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

class FaceitApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    path: string
  ) {
    super(`Faceit API error ${status} on ${path}: ${body}`)
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Thin fetch wrapper: adds auth, retries 429/5xx with backoff, and validates
 * the response with a permissive zod schema so an unexpected field doesn't
 * crash the whole sync run for one player.
 */
async function faceitFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  { allow404 = false }: { allow404?: boolean } = {}
): Promise<T | null> {
  const url = `${FACEIT_API_BASE}${path}`
  const maxRetries = 5
  let attempt = 0
  let backoffMs = 1000

  for (;;) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    })

    if (res.ok) {
      const json = await res.json()
      return schema.parse(json)
    }

    if (res.status === 404 && allow404) return null

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= maxRetries) {
      const body = await res.text().catch(() => "")
      throw new FaceitApiError(res.status, body, path)
    }

    const retryAfterHeader = res.headers.get("Retry-After")
    const retryAfterMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : null
    const waitMs =
      retryAfterMs && !Number.isNaN(retryAfterMs) ? retryAfterMs : backoffMs
    console.warn(
      `[faceit-client] ${res.status} on ${path}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
    )
    await sleep(waitMs)
    backoffMs = Math.min(backoffMs * 2, 30_000)
    attempt++
  }
}

// Loose/passthrough schemas: assert only the fields we read, leave the rest
// unvalidated since several of Faceit's response shapes aren't confirmed
// from docs (see lib/faceit-client.ts probe step in scripts/faceit-sync.ts).
const faceitPlayerSchema = z
  .object({
    player_id: z.string(),
    nickname: z.string(),
    games: z
      .object({
        cs2: z
          .object({
            faceit_elo: z.number().nullish(),
            skill_level: z.number().nullish(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export type FaceitPlayer = {
  playerId: string
  nickname: string
  elo: number | null
  skillLevel: number | null
}

function toFaceitPlayer(raw: z.infer<typeof faceitPlayerSchema>): FaceitPlayer {
  return {
    playerId: raw.player_id,
    nickname: raw.nickname,
    elo: raw.games?.cs2?.faceit_elo ?? null,
    skillLevel: raw.games?.cs2?.skill_level ?? null,
  }
}

/** GET /players?game=cs2&game_player_id={steamid64} - resolve a Steam ID. */
export async function getPlayerBySteamId(
  steamid64: string
): Promise<FaceitPlayer | null> {
  const result = await faceitFetch(
    `/players?game=cs2&game_player_id=${encodeURIComponent(steamid64)}`,
    faceitPlayerSchema,
    { allow404: true }
  )
  return result ? toFaceitPlayer(result) : null
}

const historyItemSchema = z
  .object({
    match_id: z.string(),
    started_at: z.number().nullish(),
    finished_at: z.number().nullish(),
  })
  .passthrough()

export type FaceitHistoryItem = z.infer<typeof historyItemSchema>

const historyResponseSchema = z.object({
  items: z.array(historyItemSchema),
})

/**
 * GET /players/{id}/history?game=cs2&from=&to=&offset=&limit=
 * `from`/`to` are unix seconds (confirmed empirically - passing milliseconds
 * gets a 400 "there was something wrong with your request").
 * Paginates defensively, capped at a handful of pages — Faceit's API has a
 * known community-reported bug where paging past the first page can return
 * an empty items array even when more matches exist, so we stop early
 * rather than looping forever.
 */
export async function getPlayerHistory(
  playerId: string,
  opts: { from: number; to: number; limit?: number }
): Promise<FaceitHistoryItem[]> {
  const limit = opts.limit ?? 20
  const maxPages = 5
  const items: FaceitHistoryItem[] = []

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit
    const result = await faceitFetch(
      `/players/${encodeURIComponent(playerId)}/history?game=cs2&from=${opts.from}&to=${opts.to}&offset=${offset}&limit=${limit}`,
      historyResponseSchema
    )
    if (!result || result.items.length === 0) break
    items.push(...result.items)
    if (result.items.length < limit) break
  }

  return items
}

const matchStatsResponseSchema = z
  .object({
    rounds: z.array(
      z
        .object({
          teams: z.array(
            z
              .object({
                players: z.array(
                  z
                    .object({
                      player_id: z.string(),
                      player_stats: z.record(z.string(), z.unknown()),
                    })
                    .passthrough()
                ),
              })
              .passthrough()
          ),
        })
        .passthrough()
    ),
  })
  .passthrough()

export type FaceitMatchStats = z.infer<typeof matchStatsResponseSchema>

/** GET /matches/{match_id}/stats */
export async function getMatchStats(
  matchId: string
): Promise<FaceitMatchStats | null> {
  return faceitFetch(
    `/matches/${encodeURIComponent(matchId)}/stats`,
    matchStatsResponseSchema,
    { allow404: true }
  )
}

/**
 * GET /players/{id}/stats/cs2 - lifetime stats. Kept loosely typed; not
 * required for the recent-activity aggregates, but useful for probing.
 */
export async function getPlayerStatsLifetime(
  playerId: string
): Promise<Record<string, unknown> | null> {
  return faceitFetch(
    `/players/${encodeURIComponent(playerId)}/stats/cs2`,
    z.record(z.string(), z.unknown())
  )
}

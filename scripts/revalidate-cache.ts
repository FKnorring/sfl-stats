import { setTimeout as sleep } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import {
  cacheScope,
  DEFAULT_DATABASE_URL,
  revalidationSourceSchema,
  type RevalidationSource,
} from "@/lib/cache-policy"

const acknowledgement = z.object({
  revalidated: z.literal(true),
  scope: z.string(),
})

export function revalidationConfig(
  env: Record<string, string | undefined> = process.env
) {
  const endpoint = env.CACHE_REVALIDATION_URL
  const secret = env.CACHE_REVALIDATION_SECRET
  if (!endpoint && !secret) return null
  if (!endpoint || !secret) {
    throw new Error(
      "Set both CACHE_REVALIDATION_URL and CACHE_REVALIDATION_SECRET, or neither"
    )
  }
  const databaseUrl = env.DATABASE_URL ?? DEFAULT_DATABASE_URL
  if (databaseUrl.startsWith("file:")) {
    throw new Error(
      "Cache notification requires an explicit hosted DATABASE_URL; local-file runs must not invalidate production"
    )
  }
  const url = new URL(endpoint)
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/revalidate"
  ) {
    throw new Error(
      "CACHE_REVALIDATION_URL must be an HTTPS /api/revalidate endpoint without credentials, query or fragment (HTTP is allowed only on loopback)"
    )
  }
  return {
    endpoint: url.href,
    secret,
    scope: cacheScope(databaseUrl, env.CACHE_NAMESPACE),
  }
}

type NotificationConfig = NonNullable<ReturnType<typeof revalidationConfig>>

export async function advanceCacheGeneration() {
  const { openWritableDb } = await import("@/lib/db/client")
  const database = openWritableDb()
  try {
    await database.run(
      sql`UPDATE cache_generation SET generation = ${randomUUID()} WHERE id = 1`
    )
    const rows = await database.all<{ generation: string }>(
      sql`SELECT generation FROM cache_generation WHERE id = 1`
    )
    if (!rows[0])
      throw new Error("Missing cache generation; apply database migrations")
  } finally {
    database.$client.close()
  }
}

export async function notifyCache(
  source: RevalidationSource,
  config: NotificationConfig,
  request = fetch,
  wait: (milliseconds: number) => Promise<unknown> = sleep
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      response = await request(config.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${config.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source, scope: config.scope }),
      })
    } catch {
      if (attempt < 2) {
        await wait(500 * (attempt + 1))
        continue
      }
      throw new Error(
        "Cache notification could not reach the configured endpoint after three attempts"
      )
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel()
      if (attempt < 2) {
        await wait(500 * (attempt + 1))
        continue
      }
    }
    if (!response.ok) {
      throw new Error(`Cache notification failed: HTTP ${response.status}`)
    }
    const value = acknowledgement.parse(await response.json())
    if (value.scope !== config.scope)
      throw new Error("Cache notification acknowledged the wrong target")
    console.log(`[cache] invalidated ${source} data`)
    return
  }
}

export async function withCacheInvalidation<Result>(
  source: RevalidationSource,
  run: (markWritePhase: () => void) => Promise<Result>,
  advance = advanceCacheGeneration
) {
  const config = revalidationConfig()
  if (!config)
    console.log(
      "[cache] notification disabled; configure both revalidation settings for deployed-cache updates"
    )
  let wrote = false
  let result!: Result
  const failures: unknown[] = []
  try {
    result = await run(() => {
      wrote = true
    })
  } catch (error) {
    failures.push(error)
  }
  if (wrote) {
    try {
      await advance()
    } catch (error) {
      failures.push(
        new Error(
          `Writes may have committed, but cache generation update failed; apply migrations and retry pnpm cache:revalidate -- --source ${source}`,
          { cause: error }
        )
      )
    }
  }
  if (wrote && config) {
    try {
      await notifyCache(source, config)
    } catch (error) {
      failures.push(
        new Error(
          `Writes may have committed, but cache invalidation failed. Retry with pnpm cache:revalidate -- --source ${source}`,
          { cause: error }
        )
      )
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Ingestion/cache notification failed")
  return result
}

async function main() {
  const args = process.argv.slice(2)
  const index = args.indexOf("--source")
  const source = revalidationSourceSchema.parse(
    index === -1 ? undefined : args[index + 1]
  )
  const config = revalidationConfig()
  if (!config) throw new Error("Configure cache revalidation before retrying")
  await advanceCacheGeneration()
  await notifyCache(source, config)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("[cache] revalidation failed:", error)
    process.exitCode = 1
  })
}

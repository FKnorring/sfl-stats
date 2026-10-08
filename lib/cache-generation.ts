import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db/client"

const requestGeneration = new AsyncLocalStorage<string>()
// Uncached across requests: late query completions must never revive old keys.
const readGeneration = cache(async () => {
  const rows = await db.all<{ generation: string }>(
    sql`SELECT generation FROM cache_generation WHERE id = 1`
  )
  if (!rows[0])
    throw new Error(
      "Missing cache generation; apply database migrations before serving the app"
    )
  return rows[0].generation
})

export function getCacheGeneration(): Promise<string> {
  const generation = requestGeneration.getStore()
  return generation === undefined
    ? readGeneration()
    : Promise.resolve(generation)
}

// React's render memoization does not apply to Route Handlers.
export async function withCacheGeneration<Result>(run: () => Promise<Result>) {
  const generation = await readGeneration()
  return requestGeneration.run(generation, run)
}

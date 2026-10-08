import { createHash } from "node:crypto"
import path from "node:path"
import { z } from "zod"

export const CURRENT_DATA_SECONDS = 21600
export const STABLE_DATA_SECONDS = 86400
export const CACHE_VERSION = "2"
export const DEFAULT_DATABASE_URL = "file:data/sfl.db"

export const revalidationSourceSchema = z.enum([
  "demos",
  "roster",
  "schedule",
  "faceit",
])
export type RevalidationSource = z.infer<typeof revalidationSourceSchema>
export type CacheGroup = "db" | "steam" | "toornament"

export function cacheScope(
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  namespace = process.env.CACHE_NAMESPACE ?? "FKnorring/sfl-stats"
): string {
  let identity: string
  if (databaseUrl.startsWith("file:")) {
    identity = `file:${path.resolve(databaseUrl.slice(5))}`
  } else {
    const url = new URL(databaseUrl)
    identity = `${url.protocol}//${url.host}${url.pathname}`
  }
  return `sfl:${createHash("sha256")
    .update(JSON.stringify([namespace, identity]))
    .digest("hex")
    .slice(0, 32)}`
}

export function cacheTag(group: CacheGroup): string {
  return `${cacheScope()}:${group}`
}

export function sourceCacheGroups(source: RevalidationSource): CacheGroup[] {
  return source === "roster" || source === "schedule"
    ? ["db", "toornament"]
    : ["db"]
}

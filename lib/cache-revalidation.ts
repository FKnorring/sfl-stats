import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import {
  cacheScope,
  scopedCacheTag,
  revalidationSourceSchema,
  sourceCacheGroups,
} from "@/lib/cache-policy"

const payloadSchema = z
  .object({
    source: revalidationSourceSchema,
    scope: z.string().max(64),
  })
  .strict()

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function handleCacheRevalidation(
  request: Request,
  invalidate: (tags: string[]) => void,
  secret = process.env.CACHE_REVALIDATION_SECRET
) {
  if (!secret)
    return json({ error: "Cache revalidation is not configured" }, 503)
  const expected = Buffer.from(`Bearer ${secret}`)
  const supplied = Buffer.from(request.headers.get("authorization") ?? "")
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return json({ error: "Unauthorized" }, 401)
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Expected application/json" }, 400)
  }
  const reader = request.body?.getReader()
  if (!reader) return json({ error: "Missing body" }, 400)
  let body = ""
  let bytes = 0
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 1024) {
      await reader.cancel()
      return json({ error: "Body too large" }, 413)
    }
    body += decoder.decode(value, { stream: true })
  }
  body += decoder.decode()
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }
  const payload = payloadSchema.safeParse(value)
  if (!payload.success)
    return json({ error: "Invalid revalidation payload" }, 400)
  if (payload.data.scope !== cacheScope()) {
    return json(
      { error: "Cache target does not match this database and namespace" },
      409
    )
  }
  const groups = sourceCacheGroups(payload.data.source)
  invalidate(groups.map((group) => scopedCacheTag(group)))
  return json({ revalidated: true, scope: cacheScope(), groups })
}

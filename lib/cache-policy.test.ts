import assert from "node:assert/strict"
import { test } from "node:test"
import {
  cacheScope,
  CURRENT_DATA_SECONDS,
  STABLE_DATA_SECONDS,
  CACHE_PROFILES,
  scopedCacheTag,
  sourceCacheGroups,
} from "./cache-policy"
import { handleCacheRevalidation } from "./cache-revalidation"

const secret = "fixture-cache-secret"
function request(body: unknown, token = secret) {
  return new Request("https://example.invalid/api/revalidate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

test("cache scopes isolate databases and namespaces without credentials", () => {
  assert.equal(CURRENT_DATA_SECONDS, 21600)
  assert.equal(STABLE_DATA_SECONDS, 86400)
  assert.equal(
    cacheScope("libsql://db.turso.io?token=private", "project"),
    cacheScope("libsql://db.turso.io?token=rotated", "project")
  )
  assert.notEqual(
    cacheScope("libsql://a.turso.io"),
    cacheScope("libsql://b.turso.io")
  )
  assert.notEqual(
    cacheScope("libsql://db.turso.io", "a"),
    cacheScope("libsql://db.turso.io", "b")
  )
  assert.equal(cacheScope("file:data/sfl.db"), cacheScope("file:./data/sfl.db"))
  assert.match(cacheScope(), /^sfl:[0-9a-f]{32}$/)
})

test("native profiles preserve refresh targets without imposing hard expiry", () => {
  assert.deepEqual(CACHE_PROFILES, {
    current: { stale: 300, revalidate: 21600 },
    stable: { stale: 300, revalidate: 86400 },
  })
  const scope = cacheScope("libsql://fixture.turso.io", "test")
  assert.equal(scopedCacheTag("db", scope), `${scope}:db`)
})

test("ingestion mapping conservatively expires DB and relevant external sources", () => {
  assert.deepEqual(sourceCacheGroups("demos"), ["db"])
  assert.deepEqual(sourceCacheGroups("faceit"), ["db"])
  assert.deepEqual(sourceCacheGroups("roster"), ["db", "toornament"])
  assert.deepEqual(sourceCacheGroups("schedule"), ["db", "toornament"])
})

test("revalidation fails closed and validates bounded payloads before invalidating", async () => {
  const tags: string[][] = []
  const invalidate = (values: string[]) => {
    tags.push(values)
  }
  const payload = { source: "demos", scope: cacheScope() }
  assert.equal(
    (await handleCacheRevalidation(request(payload), invalidate, "")).status,
    503
  )
  assert.equal(
    (
      await handleCacheRevalidation(
        request(payload, "wrong"),
        invalidate,
        secret
      )
    ).status,
    401
  )
  for (const body of [
    { ...payload, source: "unknown" },
    { ...payload, tag: "anything" },
    { source: "demos" },
  ]) {
    assert.equal(
      (await handleCacheRevalidation(request(body), invalidate, secret)).status,
      400
    )
  }
  assert.equal(
    (
      await handleCacheRevalidation(
        request({ ...payload, scope: "wrong" }),
        invalidate,
        secret
      )
    ).status,
    409
  )
  assert.equal(
    (
      await handleCacheRevalidation(
        request("x".repeat(2048)),
        invalidate,
        secret
      )
    ).status,
    413
  )
  const invalidJson = request(payload)
  const malformed = new Request(invalidJson.url, {
    method: "POST",
    headers: invalidJson.headers,
    body: "{",
  })
  assert.equal(
    (await handleCacheRevalidation(malformed, invalidate, secret)).status,
    400
  )
  assert.deepEqual(tags, [])
  const response = await handleCacheRevalidation(
    request(payload),
    invalidate,
    secret
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(tags, [[`${cacheScope()}:db`]])
  await assert.rejects(
    handleCacheRevalidation(
      request(payload),
      () => {
        throw new Error("invalidation failed")
      },
      secret
    ),
    /invalidation failed/
  )
})

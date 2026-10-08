import assert from "node:assert/strict"
import { test } from "node:test"
import http from "node:http"
import { once } from "node:events"
import { cacheScope } from "../lib/cache-policy"
import {
  notifyCache,
  revalidationConfig,
  withCacheInvalidation,
} from "./revalidate-cache"

const env = {
  DATABASE_URL: "libsql://fixture.turso.io",
  CACHE_REVALIDATION_URL: "https://example.invalid/api/revalidate",
  CACHE_REVALIDATION_SECRET: "fixture-secret",
}
const config = revalidationConfig(env)!

test("notification configuration is explicit, hosted and redirect-safe", () => {
  assert.equal(revalidationConfig({}), null)
  assert.throws(
    () =>
      revalidationConfig({
        CACHE_REVALIDATION_URL: env.CACHE_REVALIDATION_URL,
      }),
    /both/
  )
  assert.throws(
    () => revalidationConfig({ ...env, DATABASE_URL: "file:data/sfl.db" }),
    /local-file/
  )
  for (const endpoint of [
    "http://example.invalid/api/revalidate",
    "https://secret@example.invalid/api/revalidate",
    "https://example.invalid/api/revalidate?secret=bad",
    "https://example.invalid/other",
  ]) {
    assert.throws(() =>
      revalidationConfig({ ...env, CACHE_REVALIDATION_URL: endpoint })
    )
  }
  assert.equal(config.scope, cacheScope(env.DATABASE_URL))
})

test("notification retries transient failures and verifies the acknowledgement", async () => {
  let calls = 0
  const waits: number[] = []
  await notifyCache(
    "demos",
    config,
    async (_input, init) => {
      calls++
      assert.equal(init?.redirect, "error")
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${config.secret}`
      )
      assert.deepEqual(JSON.parse(String(init?.body)), {
        source: "demos",
        scope: config.scope,
      })
      if (calls === 1) throw new TypeError("network fixture")
      if (calls === 2) return new Response("", { status: 503 })
      return Response.json({ revalidated: true, scope: config.scope })
    },
    async (delay) => {
      waits.push(delay)
    }
  )
  assert.equal(calls, 3)
  assert.deepEqual(waits, [500, 1000])
  calls = 0
  await assert.rejects(
    notifyCache("demos", config, async () => {
      calls++
      return new Response("", { status: 401 })
    }),
    /HTTP 401/
  )
  assert.equal(calls, 1)
  await assert.rejects(
    notifyCache("faceit", config, async () =>
      Response.json({ revalidated: true, scope: "wrong" })
    ),
    /wrong target/
  )
  await assert.rejects(
    notifyCache("demos", config, async () =>
      Response.json({ revalidated: false })
    )
  )
})

test("write phases notify on no-op/partial failure; probes do not; errors retain both failures", async () => {
  let calls = 0
  let generations = 0
  let status = 200
  const server = http.createServer(async (request, response) => {
    calls++
    for await (const chunk of request) assert.ok(chunk)
    response.writeHead(status, { "Content-Type": "application/json" })
    response.end(
      JSON.stringify({ revalidated: true, scope: cacheScope(env.DATABASE_URL) })
    )
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const keys = [
    "DATABASE_URL",
    "CACHE_REVALIDATION_URL",
    "CACHE_REVALIDATION_SECRET",
    "CACHE_NAMESPACE",
  ] as const
  const original = keys.map((key) => process.env[key])
  process.env.DATABASE_URL = env.DATABASE_URL
  process.env.CACHE_REVALIDATION_URL = `http://127.0.0.1:${address.port}/api/revalidate`
  process.env.CACHE_REVALIDATION_SECRET = env.CACHE_REVALIDATION_SECRET
  delete process.env.CACHE_NAMESPACE
  try {
    const advance = async () => {
      generations++
    }
    await withCacheInvalidation("faceit", async () => {}, advance)
    assert.equal(calls, 0)
    assert.equal(generations, 0)
    await withCacheInvalidation(
      "demos",
      async (mark) => {
        mark()
      },
      advance
    )
    assert.equal(calls, 1)
    await assert.rejects(
      withCacheInvalidation(
        "demos",
        async (mark) => {
          mark()
          throw new Error("partial ingestion")
        },
        advance
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError)
        assert.match(String(error.errors[0]), /partial ingestion/)
        return true
      }
    )
    assert.equal(calls, 2)
    status = 401
    await assert.rejects(
      withCacheInvalidation(
        "roster",
        async (mark) => {
          mark()
          throw new Error("original failure")
        },
        advance
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError)
        assert.equal(error.errors.length, 2)
        assert.match(String(error.errors[0]), /original failure/)
        assert.match(
          String(error.errors[1]),
          /Writes may have committed.*cache invalidation failed/
        )
        return true
      }
    )
    process.env.CACHE_REVALIDATION_SECRET = ""
    let ran = false
    await assert.rejects(
      withCacheInvalidation("schedule", async () => {
        ran = true
      }),
      /both/
    )
    assert.equal(ran, false)
    assert.equal(generations, 3)
    delete process.env.CACHE_REVALIDATION_URL
    delete process.env.CACHE_REVALIDATION_SECRET
    await withCacheInvalidation(
      "schedule",
      async (mark) => {
        mark()
      },
      advance
    )
    assert.equal(generations, 4)
    assert.equal(calls, 3, "Disabled callbacks must not notify")
    await assert.rejects(
      withCacheInvalidation(
        "demos",
        async (mark) => {
          mark()
        },
        async () => {
          throw new Error("generation write failed")
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError)
        assert.match(String(error.errors[0]), /generation update failed/)
        assert.match(String(error.errors[0].cause), /generation write failed/)
        return true
      }
    )
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key]
      else process.env[key] = original[index]
    })
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

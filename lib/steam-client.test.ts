import assert from "node:assert/strict"
import { test } from "node:test"
import { fetchPlayerSummaryBatch } from "./steam-client"

test("Steam batches validate successful data and do not convert failures into cacheable empties", async (t) => {
  const oldKey = process.env.STEAM_API_KEY
  process.env.STEAM_API_KEY = "secret-test-key"
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      assert.equal(init?.cache, "no-store")
      return Response.json({
        response: {
          players: [
            {
              steamid: "76561198000000001",
              personaname: "Name",
              avatarfull: "avatar",
            },
          ],
        },
      })
    }
  )
  try {
    assert.deepEqual(await fetchPlayerSummaryBatch(["76561198000000001"]), [
      {
        steamid64: "76561198000000001",
        personaName: "Name",
        avatarUrl: "avatar",
      },
    ])
    mock.mock.mockImplementation(async () => new Response("", { status: 503 }))
    await assert.rejects(
      fetchPlayerSummaryBatch(["76561198000000001"]),
      /HTTP 503/
    )
    mock.mock.mockImplementation(async () => Response.json({ response: {} }))
    await assert.rejects(fetchPlayerSummaryBatch(["76561198000000001"]))
    mock.mock.mockImplementation(async () => {
      throw new TypeError("secret-test-key")
    })
    await assert.rejects(
      fetchPlayerSummaryBatch(["76561198000000001"]),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(!String(error).includes("secret-test-key"))
        return true
      }
    )
  } finally {
    if (oldKey === undefined) delete process.env.STEAM_API_KEY
    else process.env.STEAM_API_KEY = oldKey
  }
})

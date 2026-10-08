import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq, sql } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { calculatePlayerRating } from "../lib/player-rating"

test("rating CLI writes without a generation marker and skips notification preflight for dry runs", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "sfl-rating-cache-"))
  const url = pathToFileURL(path.join(folder, "fixture.db")).href
  const client = createClient({ url })
  const database = drizzle(client, { schema })
  const steamid64 = "76561198000000001"
  const fact = {
    steamid64,
    side: 2,
    kills: 1,
    weightedKills: 1,
    ecoKills: 0,
    deaths: 0,
    assists: 0,
    flashAssists: 0,
    headshotKills: 0,
    damage: 100,
    utilityDamage: 0,
    survived: true,
    traded: false,
    openingKills: 1,
    openingDeaths: 0,
    clutchWins: 0,
    clutchOpponents: 0,
    equipmentValue: 3000,
  }
  const run = (args: string[], partialConfig = false) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", path.resolve("scripts", "rate-demos.ts"), ...args],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          DATABASE_AUTH_TOKEN: "",
          CACHE_REVALIDATION_URL: undefined,
          CACHE_REVALIDATION_SECRET: partialConfig ? "fixture-only" : undefined,
        },
        encoding: "utf8",
        timeout: 30000,
      }
    )
    assert.ifError(result.error)
    return { status: result.status, output: result.stdout + result.stderr }
  }
  const rating = async () =>
    (
      await database
        .select()
        .from(schema.playerMatchStats)
        .where(eq(schema.playerMatchStats.matchId, 1))
    )[0].rating
  try {
    await migrate(database, { migrationsFolder: "drizzle" })
    assert.deepEqual(
      await database.all(
        sql`SELECT name FROM sqlite_master WHERE name = 'cache_generation'`
      ),
      []
    )
    await database.insert(schema.players).values({
      steamid64,
      latestIngameName: "Fixture player",
      firstSeenAt: "2026-10-08",
      lastSeenAt: "2026-10-08",
    })
    await database.insert(schema.matches).values({
      id: 1,
      fileName: "missing.dem",
      parsedAt: "2026-10-08",
      totalRounds: 20,
    })
    await database.insert(schema.playerMatchStats).values({
      matchId: 1,
      steamid64,
      kills: 1,
      deaths: 0,
      assists: 0,
      headshotKills: 0,
      damageTotal: 100,
      rating: 999,
    })
    const [round] = await database
      .insert(schema.matchRounds)
      .values({
        matchId: 1,
        ordinal: 0,
        rawRound: 0,
        startTick: 0,
        freezeTick: 10,
        endTick: 900,
        winner: 2,
      })
      .returning()
    await database.insert(schema.playerMatchRoundStats).values({
      ...fact,
      matchId: 1,
      roundId: round.id,
    })
    const dry = run(["--recompute", "--dry-run"], true)
    assert.equal(dry.status, 0, dry.output)
    assert.equal(await rating(), 999)
    const rejected = run(["--recompute"], true)
    assert.equal(rejected.status, 1, rejected.output)
    assert.match(rejected.output, /both/)
    assert.equal(await rating(), 999)
    const recomputed = run(["--recompute"])
    assert.equal(recomputed.status, 0, recomputed.output)
    assert.equal(await rating(), calculatePlayerRating([fact]).rating)

    await database.run(
      sql`UPDATE player_match_stats SET rating = 999 WHERE match_id = 1`
    )
    await database.insert(schema.matches).values({
      id: 2,
      fileName: "broken.dem",
      parsedAt: "2026-10-08",
    })
    const [brokenRound] = await database
      .insert(schema.matchRounds)
      .values({
        matchId: 2,
        ordinal: 0,
        rawRound: 0,
        startTick: 0,
        freezeTick: 10,
        endTick: 900,
        winner: 2,
      })
      .returning()
    await database.insert(schema.playerMatchRoundStats).values({
      ...fact,
      matchId: 2,
      roundId: brokenRound.id,
      damage: -1,
    })
    const partial = run(["--recompute"])
    assert.equal(partial.status, 1, partial.output)
    assert.match(partial.output, /Invalid rating fact damage/)
    assert.equal(await rating(), calculatePlayerRating([fact]).rating)

    const backfill = run(["--dir", folder, "--match-id", "1"])
    assert.equal(backfill.status, 0, backfill.output)
    assert.equal(await rating(), null)
  } finally {
    client.close()
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})

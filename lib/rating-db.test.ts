import assert from "node:assert/strict"
import { test } from "node:test"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq, sql } from "drizzle-orm"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as schema from "./db/schema"
import {
  persistRatingExtraction,
  recomputeMatchRatings,
  getMatchRatingSummaries,
} from "./rating-db"
import { RATING_VERSION } from "./player-rating"
import type { RatingExtraction, PlayerRoundFact } from "./demo-rating"
import { RatingValue, RatingExplanation } from "../components/player-rating"

const originalUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = "file::memory:"
const {
  getDemoMatchPlayerStats,
  getDemoRatingDetails,
  getPlayerMatchHistory,
  getLeaderboard,
  getPlayerBySteamId64,
  getTeamRoster,
} = await import("./db")
if (originalUrl === undefined) delete process.env.DATABASE_URL
else process.env.DATABASE_URL = originalUrl

const ids = ["76561198000000001", "76561198000000002"]
function extraction(): RatingExtraction {
  const rounds = Array.from({ length: 13 }, (_, ordinal) => ({
    ordinal,
    rawRound: ordinal,
    startTick: ordinal * 1000,
    freezeTick: ordinal * 1000 + 10,
    endTick: ordinal * 1000 + 900,
    winner: 2 as const,
  }))
  const facts: PlayerRoundFact[] = rounds.flatMap((round) =>
    ids.map((steamid64, index) => ({
      ordinal: round.ordinal,
      steamid64,
      name: `player-${index}`,
      side: index ? (3 as const) : (2 as const),
      kills: index ? 0 : 1,
      weightedKills: index ? 0 : 1,
      ecoKills: 0,
      deaths: index ? 1 : 0,
      assists: 0,
      flashAssists: 0,
      headshotKills: 0,
      damage: index ? 0 : 100,
      utilityDamage: 0,
      survived: !index,
      traded: false,
      openingKills: index ? 0 : 1,
      openingDeaths: index ? 1 : 0,
      clutchWins: 0,
      clutchOpponents: 0,
      equipmentValue: 3000,
    }))
  )
  return { rounds, facts, unavailableReason: null }
}

async function setup() {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: "drizzle" })
  await database.insert(schema.matches).values([
    {
      id: 1,
      fileName: "old.dem",
      totalRounds: 14,
      parsedAt: "2026-10-01",
      demoDate: "2026-10-01",
    },
    {
      id: 2,
      fileName: "other.dem",
      totalRounds: 21,
      parsedAt: "2026-10-02",
      demoDate: "2026-10-02",
    },
  ])
  await database.insert(schema.players).values({
    steamid64: ids[0],
    latestIngameName: "original",
    firstSeenAt: "2026-10-01",
    lastSeenAt: "2026-10-01",
  })
  await database.insert(schema.playerMatchStats).values({
    matchId: 1,
    steamid64: ids[0],
    kills: 99,
    deaths: 4,
    assists: 3,
    damageTotal: 1234,
    headshotKills: 10,
  })
  return { client, database }
}

test("migration keeps legacy rows unrated and enrichment is atomic/idempotent", async () => {
  const { client, database } = await setup()
  try {
    const old = (await database.select().from(schema.playerMatchStats))[0]
    assert.equal(old.rating, null)
    assert.equal(old.ratingUnavailableReason, "Not enriched")
    assert.equal(await persistRatingExtraction(database, 1, extraction()), 2)
    const first = await database.select().from(schema.playerMatchStats)
    assert.equal(first[0].kills, 99)
    assert.equal(first[0].ratingVersion, RATING_VERSION)
    assert.equal(first[0].ratingRounds, 13)
    assert.equal(first[0].ratingUnavailableReason, null)
    assert.equal(
      (await database.select().from(schema.matches))[0].totalRounds,
      14
    )
    assert.equal(await persistRatingExtraction(database, 1, extraction()), 2)
    assert.equal(
      (await database.select().from(schema.playerMatchRoundStats)).length,
      26
    )
    assert.equal(
      (await database.select().from(schema.playerMatchStats)).length,
      2
    )
    assert.deepEqual(
      (await database.select().from(schema.playerMatchStats)).map(
        (s) => s.rating
      ),
      first.map((s) => s.rating)
    )
    const broken = extraction()
    broken.rounds[1].ordinal = 0
    await assert.rejects(persistRatingExtraction(database, 1, broken))
    assert.equal(
      (await database.select().from(schema.playerMatchRoundStats)).length,
      26
    )
    const summaries = await getMatchRatingSummaries(database, 1)
    await database
      .update(schema.playerMatchStats)
      .set({ rating: 999, ratingVersion: "obsolete" })
    await recomputeMatchRatings(database, 1, true)
    assert.equal(
      (await database.select().from(schema.playerMatchStats))[0].rating,
      999
    )
    await recomputeMatchRatings(database, 1)
    assert.equal(
      (await database.select().from(schema.playerMatchStats))[0].rating,
      summaries.get(ids[0])!.rating
    )
    await persistRatingExtraction(database, 1, {
      rounds: [],
      facts: [],
      unavailableReason: "Incomplete competitive game",
    })
    assert.equal(
      (await database.select().from(schema.playerMatchRoundStats)).length,
      0
    )
    const unavailable = await database.select().from(schema.playerMatchStats)
    assert.ok(
      unavailable.every(
        (s) =>
          s.rating === null &&
          s.ratingUnavailableReason === "Incomplete competitive game"
      )
    )
  } finally {
    client.close()
  }
})

test("read queries weight rounds, isolate versions, keep unrostered players and avoid rating fan-out", async () => {
  const { client, database } = await setup()
  try {
    await persistRatingExtraction(database, 1, extraction())
    await database.insert(schema.teams).values({
      id: 1,
      name: "Alpha",
      season: "SFL Säsong 9",
      division: "1",
    })
    await database.insert(schema.rosterEntries).values(
      [1, 2].map((i) => ({
        teamId: 1,
        nickname: `claim-${i}`,
        matchedSteamid64: ids[0],
        scrapedAt: "2026-10-01",
      }))
    )
    await database.insert(schema.playerMatchStats).values({
      matchId: 2,
      steamid64: ids[0],
      kills: 1,
      deaths: 1,
      assists: 0,
      headshotKills: 0,
      damageTotal: 0,
      rating: 2,
      ratingVersion: RATING_VERSION,
      ratingRounds: 26,
      ratingUnavailableReason: null,
    })
    const initial = (await getMatchRatingSummaries(database, 1)).get(
      ids[0]
    )!.rating
    const expected = (initial * 13 + 2 * 26) / 39
    const profile = await getPlayerBySteamId64(ids[0], database)
    assert.ok(Math.abs(profile!.rating! - expected) < 1e-12)
    assert.equal(profile!.ratedGames, 2)
    const history = await getPlayerMatchHistory(ids[0], database)
    assert.equal(history[0].rating, 2)
    const roster = await getTeamRoster(1, false, database)
    assert.ok(
      roster.every(
        (p) => Math.abs(p.rating! - expected) < 1e-12 && p.ratedGames === 2
      )
    )
    for (const direction of ["asc", "desc"] as const) {
      const leaderboard = await getLeaderboard(
        { stat: "rating", direction },
        database
      )
      assert.equal(leaderboard.length, 2)
      assert.equal(
        leaderboard.find((p) => p.steamid64 === ids[1])!.teamName,
        null
      )
      assert.ok(
        Math.abs(
          leaderboard.find((p) => p.steamid64 === ids[0])!.rating! - expected
        ) < 1e-12
      )
    }
    assert.equal((await getDemoMatchPlayerStats(1, database)).length, 2)
    assert.equal(Object.keys(await getDemoRatingDetails(1, database)).length, 2)
    await database
      .update(schema.playerMatchStats)
      .set({ ratingVersion: "obsolete" })
      .where(eq(schema.playerMatchStats.steamid64, ids[1]))
    assert.equal(
      (await getDemoMatchPlayerStats(1, database)).find(
        (p) => p.steamid64 === ids[1]
      )!.rating,
      null
    )
    for (const direction of ["asc", "desc"] as const) {
      const leaderboard = await getLeaderboard(
        { stat: "rating", direction },
        database
      )
      assert.equal(leaderboard.at(-1)!.steamid64, ids[1])
    }
    await database.run(
      sql`UPDATE player_match_stats SET rating_version = 'obsolete' WHERE match_id = 2`
    )
    assert.ok(
      Math.abs(
        (await getPlayerBySteamId64(ids[0], database))!.rating! - initial
      ) < 1e-12
    )
  } finally {
    client.close()
  }
})

test("a player absent from the final scoreboard is rated without guessing a final CT/T slot", async () => {
  const { client, database } = await setup()
  try {
    const facts = extraction()
    facts.facts = facts.facts.filter(
      (fact) => fact.steamid64 !== ids[1] || fact.ordinal === 0
    )
    await persistRatingExtraction(database, 1, facts)
    const player = (
      await database
        .select()
        .from(schema.playerMatchStats)
        .where(eq(schema.playerMatchStats.steamid64, ids[1]))
    )[0]
    assert.equal(player.ratingRounds, 1)
    assert.equal(player.ratingVersion, RATING_VERSION)
    assert.equal(player.teamName, null)
    assert.equal((await getDemoMatchPlayerStats(1, database)).length, 2)
  } finally {
    client.close()
  }
})

test("rating markup distinguishes zero, unavailable, coverage and model explanation", () => {
  const zero = renderToStaticMarkup(createElement(RatingValue, { rating: 0 }))
  assert.match(zero, /0\.00/)
  const unavailable = renderToStaticMarkup(
    createElement(RatingValue, {
      rating: null,
      reason: "Incomplete competitive game",
    })
  )
  assert.match(unavailable, /Unrated: Incomplete competitive game/)
  const average = renderToStaticMarkup(
    createElement(RatingValue, {
      rating: 1.234,
      ratedGames: 2,
      matchesPlayed: 3,
    })
  )
  assert.match(average, /1\.23/)
  assert.match(average, /2 of 3 demos rated/)
  assert.match(
    renderToStaticMarkup(createElement(RatingExplanation)),
    /not an official HLTV rating/
  )
})

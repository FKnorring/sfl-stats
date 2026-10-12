import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { eq, sql } from "drizzle-orm"
import * as schema from "../../lib/db/schema"
import type { AppDb } from "../../lib/db/client"
import { deriveStats } from "./domain/demo-stats"
import type { DemoFacts, DemoKillFact } from "./domain/demo-extraction"
import type { MatchStatus } from "../../lib/matching"
import type { KillSideRow } from "./domain/team-anchoring"
import {
  applyOverrides,
  createDemoMatching,
  emptyMatchingSummary,
} from "./player-matching"
import { resolveDemoTeams } from "./team-resolution"
import { runDemoIngestion } from "./ingestion"

const ids = ["76561198000000001", "76561198000000002", "76561198000000003"]
const date = "2026-10-01T19:02:45.000Z"
const name = "2026-10-01_19-02-45_fixture.dem"
const rounds = [
  { tick: 100, winner: "CT" },
  { tick: 200, winner: "T" },
]

async function setup(t: TestContext) {
  const client = createClient({ url: "file::memory:" })
  t.after(() => client.close())
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "drizzle" })
  await db.insert(schema.teams).values(
    [1, 2, 3, 4, 5].map((id) => ({
      id,
      name: `Team ${id}`,
      season: `SFL S\u00e4song ${id === 5 ? 8 : 9}`,
      division: "Division 1",
    }))
  )
  await db.insert(schema.players).values(
    ids.map((steamid64, index) => ({
      steamid64,
      latestIngameName: ["Alpha", "Bravo", "Alphb"][index],
      firstSeenAt: date,
      lastSeenAt: date,
    }))
  )
  return db
}

async function roster(
  db: AppDb,
  id: number,
  teamId: number,
  nickname: string,
  matchStatus: MatchStatus = "unmatched",
  matchedSteamid64: string | null = null
) {
  await db.insert(schema.rosterEntries).values({
    id,
    teamId,
    nickname,
    matchStatus,
    matchedSteamid64,
    scrapedAt: date,
  })
}

function facts(): Extract<DemoFacts, { status: "ready" }> {
  return {
    status: "ready",
    header: { map_name: "de_nuke", server_name: "fixture" },
    roundEnds: rounds,
    totalRounds: 2,
    players: ids.slice(0, 2).map((steamid64, index) =>
      deriveStats(
        {
          player_steamid: steamid64,
          player_name: ["Alpha", "Bravo"][index],
          team_num: index ? 2 : 3,
          kills_total: 3,
          deaths_total: 1,
          assists_total: 2,
          headshot_kills_total: 1,
          damage_total: 200,
        },
        2
      )
    ),
    killFacts: [kill()],
    ratingFacts: {
      rounds: [],
      facts: [],
      unavailableReason: "Fixture has no rating snapshots",
    },
  }
}

function kill(): DemoKillFact {
  return {
    round: 0,
    tick: 90,
    attackerSteamid64: ids[0],
    attackerX: 1,
    attackerY: 2,
    attackerSide: "CT",
    victimSteamid64: ids[1],
    victimX: 3,
    victimY: 4,
    victimSide: "T",
    weapon: "ak47",
    headshot: true,
  }
}

function sides(_filePath: string, ticks: number[]) {
  return ticks.flatMap((tick, index) => [
    { tick, player_steamid: ids[0], team_name: index ? "TERRORIST" : "CT" },
    { tick, player_steamid: ids[1], team_name: index ? "CT" : "TERRORIST" },
  ])
}

function run(
  db: AppDb,
  files = [name],
  extract: NonNullable<Parameters<typeof runDemoIngestion>[0]["extract"]> = {
    demo: facts,
    kills: () => [kill()],
    rounds: () => rounds,
    sides,
  }
) {
  return runDemoIngestion({
    db,
    files,
    overrides: new Map(),
    toornamentWindowHours: 24,
    extract,
  })
}

async function resolution(db: AppDb) {
  const summary = emptyMatchingSummary()
  const matching = await createDemoMatching({
    db,
    overrides: new Map(),
    summary,
  })
  return {
    matching,
    summary,
    resolve: (input: Partial<Parameters<typeof resolveDemoTeams>[0]> = {}) =>
      resolveDemoTeams({
        db,
        matching,
        filePath: name,
        demoDate: date,
        toleranceHours: 24,
        roundEnds: rounds,
        killRows: [],
        readTicks: sides,
        ...input,
      }),
  }
}

test("Matching preserves season eligibility, manual overrides and claimed entries", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 5, "Bravo")
  await roster(db, 3, 2, "Bravo", "manual", ids[1])
  await roster(db, 4, 3, "Alphb", "ambiguous")
  const overrides = new Map([[ids[1], { rosterEntryId: 3, note: "fixture" }]])
  await applyOverrides(db, overrides)
  const firstOverride = (await db.select().from(schema.playerNameOverrides))[0]
  overrides.set(ids[1], { rosterEntryId: 3, note: "updated" })
  await applyOverrides(db, overrides)
  const updatedOverride = (
    await db.select().from(schema.playerNameOverrides)
  )[0]
  assert.equal(updatedOverride.createdAt, firstOverride.createdAt)
  assert.equal(updatedOverride.note, "updated")
  const summary = emptyMatchingSummary()
  const matching = await createDemoMatching({ db, overrides, summary })
  await matching.matchPlayer(ids[0], "Alpha")
  await matching.matchPlayer(ids[1], "ignored by override")
  await matching.matchPlayer(ids[2], "Alpha")
  assert.deepEqual(
    [...matching.steamidToTeam],
    [
      [ids[0], 1],
      [ids[1], 2],
    ]
  )
  assert.deepEqual(summary, {
    manual: 1,
    autoHigh: 1,
    autoLow: 0,
    ambiguous: 0,
    unmatched: 1,
  })
  const rows = await db.select().from(schema.rosterEntries)
  assert.equal(rows[0].matchedSteamid64, ids[0])
  assert.equal(rows[1].matchedSteamid64, null)
  assert.equal(rows[3].matchStatus, "ambiguous")
})

test("exact nickname ties claim every entry; fuzzy ties require review", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 2, "ALPHA")
  const { matching, summary } = await resolution(db)
  await matching.matchPlayer(ids[2], "Alphb")
  assert.equal(summary.ambiguous, 1)
  assert.equal(
    (await db.select().from(schema.rosterEntries))[0].matchedSteamid64,
    null
  )
  await matching.matchPlayer(ids[0], "Alpha")
  assert.equal(summary.autoHigh, 1)
  assert.deepEqual(
    (await db.select().from(schema.rosterEntries)).map(
      (row) => row.matchedSteamid64
    ),
    [ids[0], ids[0]]
  )
})

test("team resolution scores observed side swaps and preserves conflict provenance", async (t) => {
  const db = await setup(t)
  const { matching, resolve } = await resolution(db)
  matching.steamidToTeam.set(ids[0], 1)
  matching.steamidToTeam.set(ids[1], 2)
  const resolved = await resolve({
    priorResolution: {
      teamAId: 3,
      teamAResolution: "toornament_inferred",
      teamBId: 4,
      teamBResolution: "toornament_inferred",
    },
  })
  assert.deepEqual(resolved, {
    teamAId: 1,
    teamAScore: 2,
    teamBId: 2,
    teamBScore: 0,
    teamAResolution: "player_match",
    teamBResolution: "player_match",
    teamResolutionConflict:
      "teamA: toornament_inferred=3 vs player_match=1; teamB: toornament_inferred=4 vs player_match=2",
  })
  const missing = await resolve({ readTicks: () => [] })
  assert.equal(missing.teamAScore, 0)
  assert.equal(missing.teamBScore, 0)
  await assert.rejects(
    resolve({ readTicks: () => [{ tick: "invalid" }] }),
    /number/
  )
  assert.equal(
    (await resolve({ roundEnds: [{ tick: 1, winner: null }] })).teamAId,
    null
  )
  matching.steamidToTeam.set(ids[2], 3)
  assert.equal((await resolve()).teamAId, null)
})

test("Toornament fallback infers only a unique close opponent, never a Demo score", async (t) => {
  const db = await setup(t)
  const { matching, resolve } = await resolution(db)
  assert.equal((await resolve()).teamAId, null)
  matching.steamidToTeam.set(ids[0], 1)
  assert.equal((await resolve()).teamBId, null)
  await db.insert(schema.toornamentMatches).values({
    id: 1,
    toornamentMatchId: "fixture-1",
    teamAId: 2,
    teamBId: 1,
    teamANameRaw: "Team 2",
    teamBNameRaw: "Team 1",
    scheduledAt: date,
    teamAScore: 13,
    teamBScore: 4,
    status: "completed",
    scrapedAt: date,
  })
  const inferred = await resolve({
    readTicks: () => {
      throw new Error("not needed")
    },
  })
  assert.equal(inferred.teamBId, 2)
  assert.equal(inferred.teamBResolution, "toornament_inferred")
  assert.equal(inferred.teamAScore, null)
  assert.equal(inferred.teamBScore, null)
  await db.insert(schema.toornamentMatches).values({
    id: 2,
    toornamentMatchId: "fixture-2",
    teamAId: 1,
    teamBId: 3,
    teamANameRaw: "Team 1",
    teamBNameRaw: "Team 3",
    scheduledAt: date,
    status: "completed",
    scrapedAt: date,
  })
  assert.equal((await resolve()).teamBId, null)
  assert.equal((await resolve({ demoDate: "2026-09-01" })).teamBId, null)
  matching.steamidToTeam.set(ids[1], 4)
  assert.equal((await resolve()).teamBId, 4)
})

test("first ingestion preserves aggregate stats, kill facts and basename identity", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 2, "Bravo")
  const result = await run(db, [path.join("linked", "nested", name)])
  assert.equal(result.ingested, 1)
  assert.equal(result.failures.length, 0)
  assert.equal(result.summary.autoHigh, 2)
  const match = (await db.select().from(schema.matches))[0]
  assert.equal(match.fileName, name)
  assert.equal(match.demoDate, new Date("2026-10-01T19:02:45").toISOString())
  assert.equal(match.mapName, "de_nuke")
  assert.equal(match.teamAScore, 2)
  assert.equal(match.teamBScore, 0)
  const stats = await db.select().from(schema.playerMatchStats)
  assert.equal(stats.length, 2)
  assert.equal(stats[0].kills, 3)
  assert.equal(stats[0].adr, 100)
  assert.equal(stats[0].rating, null)
  assert.equal(
    stats[0].ratingUnavailableReason,
    "Fixture has no rating snapshots"
  )
  const storedKill = (await db.select().from(schema.matchKills))[0]
  assert.equal(storedKill.headshot, 1)
  assert.equal(storedKill.attackerX, 1)
  const rerun = await run(db, [name], {
    demo: () => {
      throw new Error("must not reparse")
    },
    kills: () => {
      throw new Error("must not backfill")
    },
    rounds: () => {
      throw new Error("must not reresolve")
    },
  })
  assert.equal(rerun.skipped, 1)
  assert.equal(rerun.reresolved, 0)
  assert.deepEqual(rerun.summary, emptyMatchingSummary())
  assert.equal((await db.select().from(schema.matchKills)).length, 1)
  assert.equal((await db.select().from(schema.playerMatchStats)).length, 2)
})

test("no-rounds/incomplete skips and null Player rows retain existing counter behavior", async (t) => {
  const db = await setup(t)
  const result = await run(db, ["empty.dem", "short.dem", name], {
    demo: (file) =>
      file === name
        ? { ...facts(), players: [null] }
        : file === "empty.dem"
          ? { status: "no-rounds", header: {} }
          : { status: "incomplete", header: {}, roundEnds: rounds },
    kills: () => [],
    rounds: () => [],
  })
  assert.equal(result.ingested, 3)
  assert.equal(result.failures.length, 0)
  assert.equal((await db.select().from(schema.matches)).length, 1)
  assert.equal((await db.select().from(schema.playerMatchStats)).length, 0)
  assert.deepEqual(result.summary, emptyMatchingSummary())
})

test("kill-only backfill leaves stats and Matching untouched, and retains world deaths", async (t) => {
  const db = await setup(t)
  await db.insert(schema.matches).values({
    fileName: name,
    parsedAt: date,
    teamAId: 1,
    teamBId: 2,
  })
  const worldDeath = { ...kill(), attackerSteamid64: null, attackerSide: null }
  const result = await run(db, [name], {
    demo: () => {
      throw new Error("must not ingest")
    },
    rounds: () => {
      throw new Error("must not resolve")
    },
    kills: () => [
      worldDeath,
      { ...kill(), victimSteamid64: null },
      { ...kill(), tick: 99, headshot: null },
    ],
  })
  assert.equal(result.skipped, 1)
  assert.deepEqual(result.summary, emptyMatchingSummary())
  assert.equal((await db.select().from(schema.playerMatchStats)).length, 0)
  const stored = await db.select().from(schema.matchKills)
  assert.equal(stored.length, 2)
  assert.equal(stored[0].attackerSteamid64, null)
  assert.equal(stored[1].headshot, null)
})

test("team reruns reuse stored kills and update resolution without reinserting stats", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await run(db)
  await roster(db, 2, 2, "Bravo", "auto_high", ids[1])
  let roundReads = 0
  const rerun = await run(db, [name], {
    demo: () => {
      throw new Error("must not ingest")
    },
    kills: () => {
      throw new Error("must reuse kills")
    },
    rounds: () => {
      roundReads++
      return rounds
    },
    sides,
  })
  assert.equal(roundReads, 1)
  assert.equal(rerun.reresolved, 1)
  assert.equal(rerun.summary.autoHigh, 2)
  const match = (await db.select().from(schema.matches))[0]
  assert.equal(match.teamBId, 2)
  assert.equal(match.teamAScore, 2)
  assert.equal((await db.select().from(schema.playerMatchStats)).length, 2)
  assert.equal((await db.select().from(schema.matchKills)).length, 1)
})

test("per-file failures retain partial writes and continue to later Demos", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 2, "Bravo")
  const failure = new Error("fixture tick extraction failure")
  const result = await run(db, [name, "fallback.dem"], {
    demo: facts,
    kills: () => [],
    rounds: () => rounds,
    sides: (file, ticks) => {
      if (file === name) throw failure
      return sides(file, ticks)
    },
  })
  assert.deepEqual(result.failures, [failure])
  assert.equal(result.ingested, 1)
  assert.equal((await db.select().from(schema.matches)).length, 2)
  assert.equal((await db.select().from(schema.playerMatchStats)).length, 4)
  const first = (
    await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.fileName, name))
  )[0]
  assert.equal(first.teamAId, null)
  const second = (
    await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.fileName, "fallback.dem"))
  )[0]
  assert.equal(second.demoDate, second.parsedAt)
  assert.equal(result.summary.autoHigh, 4)
  assert.deepEqual(
    await db.all(
      sql`SELECT name FROM sqlite_master WHERE name = 'cache_generation'`
    ),
    []
  )
})

test("anchoring upgrades replace prior outcomes instead of double counting a Player", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Zulu")
  await roster(db, 2, 1, "Alpha")
  await roster(db, 3, 2, "Alpha")
  const { matching, summary, resolve } = await resolution(db)
  await matching.matchPlayer(ids[0], "Zulu")
  await matching.matchPlayer(ids[2], "Alphb")
  assert.equal(summary.ambiguous, 1)
  const killRows: KillSideRow[] = [
    {
      round: 0,
      attackerSteamid64: ids[0],
      attackerSide: "CT",
      victimSteamid64: ids[2],
      victimSide: "CT",
    },
  ]
  await resolve({ killRows })
  assert.deepEqual(summary, {
    manual: 0,
    autoHigh: 1,
    autoLow: 1,
    ambiguous: 0,
    unmatched: 0,
  })
  assert.equal(matching.steamidToTeam.get(ids[2]), 1)
  assert.equal(
    (
      await db
        .select()
        .from(schema.rosterEntries)
        .where(eq(schema.rosterEntries.id, 2))
    )[0].matchedSteamid64,
    ids[2]
  )
  await matching.anchorPlayers(1, [ids[2]])
  assert.equal(summary.autoLow, 1)
})

test("rerun summary deduplicates roster evidence with manual/high/low precedence", async (t) => {
  const db = await setup(t)
  const initial = await run(db)
  assert.equal(initial.summary.unmatched, 2)
  await roster(db, 1, 1, "Alpha low", "auto_low", ids[0])
  await roster(db, 2, 1, "Alpha high", "auto_high", ids[0])
  await roster(db, 3, 5, "Alpha manual", "manual", ids[0])
  await roster(db, 4, 2, "Bravo high", "auto_high", ids[1])
  const rerun = await run(db)
  assert.deepEqual(rerun.summary, {
    manual: 1,
    autoHigh: 1,
    autoLow: 0,
    ambiguous: 0,
    unmatched: 0,
  })
  assert.equal(rerun.reresolved, 1)
})

test("tied anchor-team votes leave the candidate unclaimed", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 2, "Alpha")
  const { matching, resolve } = await resolution(db)
  await matching.matchPlayer(ids[2], "Alphb")
  matching.steamidToTeam.set(ids[0], 1)
  matching.steamidToTeam.set(ids[1], 2)
  const killRows: KillSideRow[] = [ids[0], ids[1]].map((id) => ({
    round: 0,
    attackerSteamid64: id,
    attackerSide: "CT",
    victimSteamid64: ids[2],
    victimSide: "CT",
  }))
  await resolve({ killRows })
  assert.equal(matching.steamidToTeam.has(ids[2]), false)
  assert.deepEqual(
    (await db.select().from(schema.rosterEntries)).map(
      (row) => row.matchedSteamid64
    ),
    [null, null]
  )
})

test("a unique highest anchor wins even when lower-ranked teams tie", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  await roster(db, 2, 2, "Alpha")
  await roster(db, 3, 3, "Alpha")
  const { matching, resolve, summary } = await resolution(db)
  await matching.matchPlayer(ids[2], "Alphb")
  const anchors = [
    [ids[0], 1],
    ["other-anchor", 1],
    [ids[1], 2],
    ["third-anchor", 3],
  ] as const
  for (const [id, teamId] of anchors) matching.steamidToTeam.set(id, teamId)
  const killRows: KillSideRow[] = anchors.map(([id]) => ({
    round: 12,
    attackerSteamid64: id,
    attackerSide: "T",
    victimSteamid64: ids[2],
    victimSide: "T",
  }))
  await resolve({ killRows })
  assert.equal(matching.steamidToTeam.get(ids[2]), 1)
  assert.equal(summary.ambiguous, 0)
  assert.equal(summary.autoLow, 1)
})

test("unmatched upgrades and repeated observations contribute one final outcome per Demo", async (t) => {
  const db = await setup(t)
  await roster(db, 1, 1, "Alpha")
  const { matching, summary } = await resolution(db)
  await matching.matchPlayer(ids[2], "XXXXX")
  assert.equal(summary.unmatched, 1)
  matching.steamidToInGameName.set(ids[2], "Alphb")
  await matching.anchorPlayers(1, [ids[2]])
  assert.deepEqual(summary, {
    manual: 0,
    autoHigh: 0,
    autoLow: 1,
    ambiguous: 0,
    unmatched: 0,
  })
  await matching.matchPlayer(ids[2], "Alphb")
  assert.equal(summary.autoLow, 1)
  const anotherDemo = await createDemoMatching({
    db,
    overrides: new Map(),
    summary,
  })
  await anotherDemo.matchPlayer(ids[2], "Alphb")
  assert.equal(summary.autoLow, 2)
})

test("round-score side-vote ties retain their existing first-observed behavior", async (t) => {
  const db = await setup(t)
  const { matching, resolve } = await resolution(db)
  matching.steamidToTeam.set(ids[0], 1)
  matching.steamidToTeam.set(ids[2], 1)
  matching.steamidToTeam.set(ids[1], 2)
  const result = await resolve({
    roundEnds: [{ tick: 10, winner: "CT" }],
    readTicks: () => [
      { tick: 10, player_steamid: ids[0], team_name: "TERRORIST" },
      { tick: 10, player_steamid: ids[2], team_name: "CT" },
      { tick: 10, player_steamid: ids[1], team_name: "CT" },
      { tick: 10, player_steamid: null, team_name: "CT" },
    ],
  })
  assert.equal(result.teamAScore, 0)
  assert.equal(result.teamBScore, 1)
})

test("rating persistence enriches facts without replacing aggregate scoreboard stats", async (t) => {
  const db = await setup(t)
  const ready = facts()
  ready.ratingFacts = {
    unavailableReason: null,
    rounds: [
      {
        ordinal: 0,
        rawRound: 0,
        startTick: 0,
        freezeTick: 10,
        endTick: 100,
        winner: 3,
      },
    ],
    facts: [
      {
        ordinal: 0,
        steamid64: ids[0],
        name: "Alpha",
        side: 3,
        kills: 1,
        weightedKills: 1,
        ecoKills: 0,
        deaths: 0,
        assists: 0,
        flashAssists: 0,
        headshotKills: 1,
        damage: 100,
        utilityDamage: 0,
        survived: true,
        traded: false,
        openingKills: 1,
        openingDeaths: 0,
        clutchWins: 0,
        clutchOpponents: 0,
        equipmentValue: 3000,
      },
    ],
  }
  const result = await run(db, [name], {
    demo: () => ready,
    kills: () => [],
    rounds: () => rounds,
  })
  assert.equal(result.failures.length, 0)
  const stats = await db.select().from(schema.playerMatchStats)
  assert.equal(stats[0].kills, 3)
  assert.equal(stats[0].ratingRounds, 1)
  assert.equal(typeof stats[0].rating, "number")
  assert.equal(stats[0].ratingUnavailableReason, null)
  assert.equal(stats[1].rating, null)
  assert.equal((await db.select().from(schema.matchRounds)).length, 1)
  assert.equal((await db.select().from(schema.playerMatchRoundStats)).length, 1)
})

test("failed kill backfill still attempts resolution and reports both errors", async (t) => {
  const db = await setup(t)
  await db.insert(schema.matches).values({ fileName: name, parsedAt: date })
  const killError = new Error("fixture kill error")
  const roundError = new Error("fixture round error")
  const result = await run(db, [name], {
    demo: () => {
      throw new Error("must not ingest")
    },
    kills: () => {
      throw killError
    },
    rounds: () => {
      throw roundError
    },
  })
  assert.equal(result.skipped, 1)
  assert.equal(result.reresolved, 0)
  assert.deepEqual(result.failures, [killError, roundError])
  assert.deepEqual(result.summary, emptyMatchingSummary())
})

test("CLI preserves defaults, validation, discovery, preflight and aggregate error reporting", async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "sfl-ingestion-cli-"))
  const client = createClient({
    url: pathToFileURL(path.join(folder, "fixture.db")).href,
  })
  const db = drizzle(client, { schema })
  t.after(async () => {
    client.close()
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  })
  const script = path.resolve("scripts", "demos", "ingest-demos.ts")
  const loader = pathToFileURL(
    path.resolve("node_modules", "tsx", "dist", "loader.mjs")
  ).href
  const tsconfig = path.resolve("tsconfig.json")
  const runCli = (
    args: string[],
    env: Record<string, string | undefined> = {}
  ) => {
    const result = spawnSync(
      process.execPath,
      ["--import", loader, script, ...args],
      {
        cwd: folder,
        env: {
          ...process.env,
          DATABASE_URL: pathToFileURL(path.join(folder, "fixture.db")).href,
          DATABASE_AUTH_TOKEN: "",
          CACHE_REVALIDATION_URL: undefined,
          CACHE_REVALIDATION_SECRET: undefined,
          DEMOS_DIR: undefined,
          TSX_TSCONFIG_PATH: tsconfig,
          ...env,
        },
        encoding: "utf8",
        timeout: 30000,
      }
    )
    assert.ifError(result.error)
    return { status: result.status, output: result.stdout + result.stderr }
  }
  await migrate(db, { migrationsFolder: "drizzle" })
  client.close()
  await mkdir(path.join(folder, "data"))
  const empty = runCli([])
  assert.equal(empty.status, 0, empty.output)
  assert.match(empty.output, /found 0 \.dem files/)
  assert.match(empty.output, /notification disabled/)
  const missingDir = runCli(["--dir"])
  assert.equal(missingDir.status, 1, missingDir.output)
  assert.match(missingDir.output, /--dir requires a value/)
  for (const value of ["0", "-1", "NaN"]) {
    const invalid = runCli(["--toornament-window-hours", value])
    assert.equal(invalid.status, 1, invalid.output)
    assert.match(invalid.output, /requires a positive number/)
  }
  const missingWindow = runCli(["--toornament-window-hours"])
  assert.equal(missingWindow.status, 1, missingWindow.output)
  const explicit = path.join(folder, "explicit")
  const envDir = runCli([], { DEMOS_DIR: explicit })
  assert.equal(envDir.status, 0, envDir.output)
  assert.ok(envDir.output.includes(`under ${explicit}`))
  const flagDir = runCli(["--dir", folder, "--toornament-window-hours", "12"], {
    DEMOS_DIR: explicit,
  })
  assert.equal(flagDir.status, 0, flagDir.output)
  assert.ok(flagDir.output.includes(`under ${folder}`))
  const overridesPath = path.join(folder, "data", "player-overrides.json")
  await writeFile(overridesPath, '{"invalid":{"rosterEntryId":"bad"}}')
  const badOverride = runCli([])
  assert.equal(badOverride.status, 1, badOverride.output)
  assert.match(badOverride.output, /number/)
  const preflight = runCli([], { CACHE_REVALIDATION_SECRET: "fixture-only" })
  assert.equal(preflight.status, 1, preflight.output)
  assert.match(preflight.output, /Set both/)
  assert.doesNotMatch(preflight.output, /found 0/)
  await writeFile(overridesPath, "{}")
  const demoDir = path.join(folder, "demos")
  const nested = path.join(demoDir, "nested")
  await mkdir(nested, { recursive: true })
  await writeFile(path.join(nested, "invalid.DeM"), Buffer.alloc(32))
  await symlink(nested, path.join(demoDir, "linked"), "junction")
  const invalidDemo = runCli([])
  assert.equal(invalidDemo.status, 1, invalidDemo.output)
  assert.match(invalidDemo.output, /found 2 \.dem files/)
  assert.match(invalidDemo.output, /done: 0 parsed/)
  assert.match(
    invalidDemo.output,
    /Some demos failed; earlier writes may have committed/
  )
  const verification = createClient({
    url: pathToFileURL(path.join(folder, "fixture.db")).href,
  })
  try {
    const result = await verification.execute(
      "SELECT COUNT(*) AS n FROM matches"
    )
    assert.equal(result.rows[0].n, 0)
  } finally {
    verification.close()
  }
})

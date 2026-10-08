import assert from "node:assert/strict"
import { test } from "node:test"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "./db/schema"
import { teamMvp } from "./follow-stats"
import type { TeamRosterPlayerRow } from "./db"

const originalUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = "file::memory:"
const { getTeamRoster, getTeamDemoMatches } = await import("./db")
if (originalUrl === undefined) delete process.env.DATABASE_URL
else process.env.DATABASE_URL = originalUrl

test("follow queries share demo membership and exclude anchored conflicting teams", async () => {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema })
  try {
    await migrate(database, { migrationsFolder: "drizzle" })
    await database.insert(schema.teams).values(
      [1, 2, 3, 4].map((id) => ({
        id,
        name: `Team ${id}`,
        season: id === 4 ? "SFL Säsong 8" : "SFL Säsong 9",
        division: "Division 1",
      }))
    )
    await database.insert(schema.players).values(
      ["p1", "p2"].map((steamid64) => ({
        steamid64,
        latestIngameName: steamid64,
        firstSeenAt: "2026-10-01",
        lastSeenAt: "2026-10-07",
      }))
    )
    await database.insert(schema.rosterEntries).values([
      {
        teamId: 1,
        nickname: "p1",
        matchedSteamid64: "p1",
        scrapedAt: "2026-10-07",
      },
      {
        teamId: 4,
        nickname: "old p1",
        matchedSteamid64: "p1",
        scrapedAt: "2025-01-01",
      },
      { teamId: 1, nickname: "unmatched", scrapedAt: "2026-10-07" },
      {
        teamId: 2,
        nickname: "p2",
        matchedSteamid64: "p2",
        scrapedAt: "2026-10-07",
      },
    ])
    await database.insert(schema.matches).values(
      [
        { id: 1, teamAId: 1, teamBId: 2 },
        { id: 2 },
        { id: 3, teamAId: 2, teamBId: 3 },
        { id: 4, teamAId: 1, teamBId: 2 },
        { id: 5, teamAId: 2 },
        { id: 6, teamAId: 2 },
      ].map((match) => ({
        fileName: `${match.id}.dem`,
        demoDate: `2026-10-0${match.id}`,
        parsedAt: "2026-10-07",
        ...match,
      }))
    )
    await database.insert(schema.playerMatchStats).values(
      [
        { matchId: 1, steamid64: "p1", teamName: "CT", adr: 100 },
        { matchId: 2, steamid64: "p1", teamName: "CT", adr: 80 },
        { matchId: 2, steamid64: "p2", teamName: "T", adr: 90 },
        { matchId: 3, steamid64: "p1", teamName: "CT", adr: 999 },
        { matchId: 5, steamid64: "p1", teamName: "CT", adr: 60 },
        { matchId: 5, steamid64: "p2", teamName: "T", adr: 70 },
        { matchId: 6, steamid64: "p1", teamName: "CT", adr: 999 },
        { matchId: 6, steamid64: "p2", teamName: "CT", adr: 70 },
      ].map((stat) => ({
        kills: 10,
        deaths: 0,
        assists: 2,
        headshotKills: 0,
        damageTotal: 1000,
        ...stat,
      }))
    )
    const [roster, history] = await Promise.all([
      getTeamRoster(1, true, database),
      getTeamDemoMatches(1, true, database),
    ])
    assert.deepEqual(
      history.map((row) => row.matchId),
      [5, 4, 2, 1]
    )
    assert.equal(
      history.find((row) => row.matchId === 4)?.opponentTeamName,
      "Team 2"
    )
    assert.equal(history.find((row) => row.matchId === 2)?.opponentTeamId, 2)
    assert.equal(roster.length, 2)
    assert.equal(roster.find((row) => row.steamid64 === "p1")?.matchesPlayed, 3)
    assert.equal(teamMvp(roster)?.adr, 80)
    assert.equal(roster.find((row) => row.nickname === "unmatched")?.adr, null)
    assert.equal(
      (await getTeamRoster(1, false, database)).find(
        (row) => row.steamid64 === "p1"
      )?.matchesPlayed,
      5
    )
  } finally {
    client.close()
  }
})

test("MVP ignores missing stats, handles zero deaths, and has deterministic tie breaks", () => {
  const player: TeamRosterPlayerRow = {
    rating: null,
    ratedGames: 0,
    rosterEntryId: 1,
    steamid64: "p1",
    nickname: "p1",
    inGameName: null,
    matchStatus: "manual",
    matchesPlayed: 1,
    kills: 10,
    deaths: 0,
    assists: 0,
    adr: 80,
    hsPct: null,
    mvps: 0,
  }
  assert.equal(
    teamMvp([
      { ...player, matchesPlayed: 0 },
      { ...player, adr: null },
    ]),
    null
  )
  assert.equal(
    teamMvp([player, { ...player, rosterEntryId: 2, kills: 11 }])
      ?.rosterEntryId,
    2
  )
  assert.equal(
    teamMvp([player, { ...player, rosterEntryId: 2, matchesPlayed: 2 }])
      ?.rosterEntryId,
    2
  )
  assert.equal(
    teamMvp([{ ...player, rosterEntryId: 3 }, player])?.rosterEntryId,
    1
  )
})

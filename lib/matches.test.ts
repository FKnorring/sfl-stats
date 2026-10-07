import assert from "node:assert/strict"
import { test } from "node:test"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "./db/schema"
import {
  formatMatchDate,
  matchDateTime,
  matchesFilters,
  type MatchTeam,
} from "./matches"
import { enrichUpcomingMatches, getLivePendingMatches } from "./toornament-live"
import type { ScheduledMatch } from "./toornament-schedule"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MatchesView } from "../app/matches/matches-view"

// Importing the app's default connection must not create or open a real DB.
const originalUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = "file::memory:"
const { getDemoMatches, getMatchTeams } = await import("./db")
if (originalUrl === undefined) delete process.env.DATABASE_URL
else process.env.DATABASE_URL = originalUrl

const teams: MatchTeam[] = [
  { teamId: 1, teamName: "Alpha", season: "SFL Säsong 9", division: "1" },
  { teamId: 2, teamName: "Beta", season: "SFL Säsong 9", division: "1" },
  { teamId: 3, teamName: "Gamma", season: "SFL Säsong 10", division: "2A" },
  { teamId: 4, teamName: "Old Alpha", season: "SFL Säsong 8", division: "1" },
  { teamId: 5, teamName: "Old Beta", season: "SFL Säsong 8", division: "1" },
]

test("all-demo query keeps unique eligible rows and aligns roster fallbacks", async () => {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema })
  try {
    await migrate(database, { migrationsFolder: "drizzle" })
    await database.insert(schema.teams).values(
      teams.map((team) => ({
        id: team.teamId,
        name: team.teamName,
        season: team.season,
        division: team.division,
      }))
    )
    await database.insert(schema.players).values(
      ["p1", "p2", "p3", "p4", "p5", "p6"].map((steamid64) => ({
        steamid64,
        latestIngameName: steamid64,
        firstSeenAt: "2026-10-01",
        lastSeenAt: "2026-10-01",
      }))
    )
    await database.insert(schema.rosterEntries).values(
      [1, 1, 2, 2, 3, 4].map((teamId, i) => ({
        teamId,
        nickname: `p${i + 1}`,
        matchedSteamid64: `p${i + 1}`,
        scrapedAt: "2026-10-01",
      }))
    )
    await database.insert(schema.rosterEntries).values([
      {
        teamId: 4,
        nickname: "p1",
        matchedSteamid64: "p1",
        scrapedAt: "2025-01-01",
      },
      {
        teamId: 1,
        nickname: "p2",
        matchedSteamid64: "p2",
        scrapedAt: "2026-10-02",
      },
    ])
    await database.insert(schema.matches).values(
      [
        { id: 1, teamAId: 1, teamBId: 2, teamAScore: 13, teamBScore: 5 },
        { id: 2 },
        { id: 3, teamAId: 2 },
        { id: 4, teamAId: 4, teamBId: 5 },
        { id: 5, teamAId: 4, teamBId: 3 },
        { id: 6, demoDate: null },
        { id: 7 },
        { id: 8, demoDate: "invalid-date" },
        { id: 9, teamAId: 1, teamBId: 2, demoDate: "2026-10-01" },
        { id: 10, teamBId: 1 },
        { id: 11 },
        { id: 12 },
        { id: 13, teamAId: 1 },
      ].map((match) => ({
        fileName: `fixture-${match.id}.dem`,
        mapName: "de_nuke",
        parsedAt: "2026-10-07",
        demoDate: `2026-10-${String(match.id).padStart(2, "0")}`,
        ...match,
      }))
    )
    const stats = [
      [2, "p1", "CT"],
      [2, "p2", "CT"],
      [2, "p3", "TERRORIST"],
      [3, "p1", "CT"],
      [3, "p3", "TERRORIST"],
      [7, "p6", "CT"],
      [10, "p1", "CT"],
      [10, "p3", "TERRORIST"],
      [11, "p1", "CT"],
      [11, "p3", "CT"],
      [11, "p5", "TERRORIST"],
      [12, "p1", "CT"],
      [12, "p2", "TERRORIST"],
      [13, "p1", "CT"],
      [13, "p2", "TERRORIST"],
      [13, "p3", "TERRORIST"],
    ] as const
    await database.insert(schema.playerMatchStats).values(
      stats.map(([matchId, steamid64, teamName]) => ({
        matchId,
        steamid64,
        teamName,
        kills: 1,
        deaths: 1,
        assists: 0,
        headshotKills: 0,
        damageTotal: 100,
      }))
    )
    await database.insert(schema.toornamentMatches).values({
      toornamentMatchId: "official-result",
      scheduledAt: "2026-10-02",
      teamANameRaw: "Alpha",
      teamBNameRaw: "Beta",
      teamAId: 1,
      teamBId: 2,
      teamAScore: 2,
      teamBScore: 0,
      status: "completed",
      scrapedAt: "2026-10-07",
    })

    const rows = await getDemoMatches(database)
    assert.deepEqual(
      rows.map((row) => row.matchId),
      [13, 12, 11, 10, 5, 3, 2, 9, 1, 8, 6]
    )
    assert.equal(new Set(rows.map((row) => row.matchId)).size, rows.length)
    function row(id: number) {
      const found = rows.find((row) => row.matchId === id)
      assert.ok(found)
      return found
    }
    assert.deepEqual(
      [
        row(2).teamAName,
        row(2).teamBName,
        row(2).teamAScore,
        row(2).teamBScore,
      ],
      ["Alpha", "Beta", null, null]
    )
    assert.deepEqual([row(3).teamAName, row(3).teamBName], ["Beta", "Alpha"])
    assert.deepEqual([row(10).teamAName, row(10).teamBName], ["Beta", "Alpha"])
    assert.deepEqual([row(11).teamAName, row(11).teamBName], [null, "Gamma"])
    assert.deepEqual([row(12).teamAName, row(12).teamBName], ["Alpha", null])
    assert.deepEqual([row(13).teamAName, row(13).teamBName], ["Alpha", null])
    assert.deepEqual([row(5).teamADivision, row(5).teamBDivision], [null, "2A"])
    assert.deepEqual([row(6).teamAName, row(6).teamBName], [null, null])
    assert.deepEqual([row(1).teamAScore, row(1).teamBScore], [13, 5])
    assert.ok(
      !rows.some(
        (row) => row.teamAName === "CT" || row.teamBName === "TERRORIST"
      )
    )
    assert.deepEqual(await getMatchTeams("SFL Säsong 8", database), [])
    assert.equal((await getMatchTeams("SFL Säsong 9", database)).length, 2)
  } finally {
    client.close()
  }
})

function scheduled(
  id: string,
  teamAName: string,
  scheduledAt: string | null = null,
  status: ScheduledMatch["status"] = "pending"
): ScheduledMatch {
  return {
    toornamentMatchId: id,
    teamAName,
    teamBName: "Unlisted Team",
    scheduledAt,
    status,
    teamALogoPath: null,
    teamBLogoPath: null,
    teamAScore: null,
    teamBScore: null,
  }
}

test("live enrichment prefers exact names, rejects fuzzy ties, and orders unknown dates last", () => {
  const candidates: MatchTeam[] = [
    { ...teams[0], teamName: "Acme Team1" },
    { ...teams[1], teamName: "Acme Team2" },
    { ...teams[2], teamName: "Acme Team" },
  ]
  assert.equal(
    enrichUpcomingMatches([scheduled("1", "Acme Team")], candidates)[0]
      .teamADivision,
    "2A"
  )
  assert.equal(
    enrichUpcomingMatches(
      [scheduled("1", "Acme Team")],
      candidates.slice(0, 2)
    )[0].teamADivision,
    null
  )
  assert.equal(
    enrichUpcomingMatches(
      [scheduled("1", "Acme Team")],
      candidates.slice(0, 1)
    )[0].teamADivision,
    "1"
  )
  assert.equal(
    enrichUpcomingMatches(
      [scheduled("1", "Acme Team")],
      [candidates[2], { ...candidates[2], teamId: 99 }]
    )[0].teamADivision,
    null
  )
  assert.equal(
    enrichUpcomingMatches([scheduled("1", "Not a known team")], teams)[0]
      .teamADivision,
    null
  )

  const rows = enrichUpcomingMatches(
    [
      scheduled("tbd", "ALPHA"),
      scheduled("invalid", "Alpha", "invalid"),
      scheduled("late", "Alpha", "2026-10-08T18:00:00Z"),
      scheduled("early", "Alpha", "2026-10-07T18:00:00Z"),
      scheduled("completed", "Alpha", "2026-10-06", "completed"),
    ],
    teams
  )
  assert.deepEqual(
    rows.map((row) => row.matchId),
    ["early", "late", "invalid", "tbd"]
  )
  assert.equal(rows[3].teamAName, "Alpha")
  assert.equal(rows[3].teamARawName, "ALPHA")
})

test("shared filters match either canonical/raw team, combine division and search, and clear", () => {
  const match = {
    teamAName: "Alpha",
    teamBName: "Beta",
    teamARawName: "Original Alpha Name",
    teamADivision: "1",
    teamBDivision: "2A",
  }
  assert.ok(matchesFilters(match, "", "  bETA "))
  assert.ok(matchesFilters(match, "2A", "alpha"))
  assert.ok(matchesFilters(match, "1", "original"))
  assert.ok(!matchesFilters(match, "3", "alpha"))
  assert.ok(!matchesFilters(match, "1", "nuke"))
  assert.ok(matchesFilters(match, "", ""))
  const unknown = {
    teamAName: null,
    teamBName: null,
    teamADivision: null,
    teamBDivision: null,
  }
  assert.ok(matchesFilters(unknown, "", " "))
  assert.ok(!matchesFilters(unknown, "1", ""))
})

test("initial view labels the all-divisions control and keeps history during schedule failure", () => {
  const html = renderToStaticMarkup(
    createElement(MatchesView, {
      divisions: ["1"],
      upcoming: null,
      history: [
        {
          matchId: 42,
          mapName: "de_nuke",
          demoDate: null,
          teamAName: null,
          teamBName: null,
          teamADivision: null,
          teamBDivision: null,
          teamAScore: null,
          teamBScore: null,
        },
      ],
    })
  )
  assert.match(html, /All divisions/)
  assert.match(html, /Demo history is still available below/)
  assert.match(html, /href="\/matches\/demo\/42"/)
  assert.match(html, /Unknown team/)
})

test("dates are deterministic in Stockholm time and explicitly handle invalid/missing values", () => {
  assert.equal(matchDateTime("invalid"), null)
  assert.equal(matchDateTime(null), null)
  assert.equal(formatMatchDate(null), "Unknown date")
  assert.equal(formatMatchDate("invalid", true), "TBD")
  assert.equal(formatMatchDate("2026-10-07T18:00:00Z"), "7 Oct 2026")
  assert.match(formatMatchDate("2026-10-07T18:00:00Z", true), /20:00/)
})

const widget = `<div data-role="sch-event" data-time="2026-10-07T18:00:00Z">
  <div class="match" data-type="match" data-id="pending">
    <div class="opponent"><div class="name">Alpha</div></div>
    <div class="opponent"><div class="name">Beta</div></div>
  </div>
  <div class="match" data-type="match" data-id="completed">
    <div class="opponent"><div class="name win">Alpha</div><div class="result">2</div></div>
    <div class="opponent"><div class="name loss">Beta</div><div class="result">0</div></div>
  </div>
</div>`

test("live schedule fetch keeps five-minute cache options and excludes completed matches", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(widget)
  )
  const rows = await getLivePendingMatches()
  assert.deepEqual(
    rows?.map((row) => row.toornamentMatchId),
    ["pending"]
  )
  assert.deepEqual(fetch.mock.calls[0].arguments[1], {
    next: { revalidate: 300 },
  })
})

test("an empty live schedule is not an unavailable schedule", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(""))
  assert.deepEqual(await getLivePendingMatches(), [])
})

test("HTTP and network failures are explicit; unexpected errors are not swallowed", async (t) => {
  const diagnostics = t.mock.method(console, "error", () => {})
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 503 })
  )
  assert.equal(await getLivePendingMatches(), null)
  fetch.mock.mockImplementation(async () => {
    throw new TypeError("Network unavailable")
  })
  assert.equal(await getLivePendingMatches(), null)
  assert.equal(diagnostics.mock.callCount(), 2)
  fetch.mock.mockImplementation(async () => {
    throw new Error("Unexpected programming error")
  })
  await assert.rejects(getLivePendingMatches(), /Unexpected programming error/)
})

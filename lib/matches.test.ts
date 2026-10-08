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
import {
  enrichUpcomingMatches,
  getLiveDivisionResults,
  getLivePendingMatches,
} from "./toornament-live"
import type { ScheduledMatch } from "./toornament-schedule"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MatchesView } from "../app/matches/matches-view"
import { DemoMatchView } from "../app/matches/demo/[matchId]/demo-match-view"
import { FollowProvider } from "../components/follow-provider"

// Importing the app's default connection must not create or open a real DB.
const originalUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = "file::memory:"
const {
  getDemoMatches,
  getDemoMatchById,
  getDemoMatchPlayerStats,
  getMatchTeams,
  getToornamentScoreForDemo,
} = await import("./db")
if (originalUrl === undefined) delete process.env.DATABASE_URL
else process.env.DATABASE_URL = originalUrl

const teams: MatchTeam[] = [
  { teamId: 1, teamName: "Alpha", season: "SFL Säsong 9", division: "1" },
  { teamId: 2, teamName: "Beta", season: "SFL Säsong 9", division: "1" },
  { teamId: 3, teamName: "Gamma", season: "SFL Säsong 10", division: "2A" },
  { teamId: 4, teamName: "Old Alpha", season: "SFL Säsong 8", division: "1" },
  { teamId: 5, teamName: "Old Beta", season: "SFL Säsong 8", division: "1" },
]

test("division results preserve completed-score filtering through cache loaders", async () => {
  const match: ScheduledMatch = {
    toornamentMatchId: "completed",
    scheduledAt: null,
    teamAName: "Alpha",
    teamBName: "Beta",
    teamALogoPath: null,
    teamBLogoPath: null,
    teamAScore: 13,
    teamBScore: 7,
    status: "completed",
  }
  const rows = await getLiveDivisionResults(
    teams[0],
    async () => [
      {
        season: teams[0].season,
        division: teams[0].division,
        path: "/tournaments/123/stages/456/",
      },
    ],
    async (tournamentId) => {
      assert.equal(tournamentId, "123")
      return [
        match,
        { ...match, status: "pending" },
        { ...match, teamBScore: null },
      ]
    }
  )
  assert.deepEqual(rows, [match])
})

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
      ["Alpha", "Beta", 2, 0]
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

test("history and detail share eligible teams, side alignment, and sourced results", async () => {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema })
  try {
    await migrate(database, { migrationsFolder: "drizzle" })
    await database.insert(schema.teams).values([
      { id: 1, name: "Alpha", season: "SFL Säsong 9", division: "1" },
      { id: 2, name: "Beta", season: "SFL Säsong 9", division: "1" },
      { id: 3, name: "Old Alpha", season: "SFL Säsong 8", division: "2" },
      { id: 4, name: "Old Beta", season: "SFL Säsong 7", division: "2" },
      { id: 5, name: "Gamma", season: "SFL Säsong 9", division: "1" },
    ])
    await database.insert(schema.players).values(
      ["a", "b", "c"].map((steamid64) => ({
        steamid64,
        latestIngameName: steamid64,
        firstSeenAt: "2026-10-01",
        lastSeenAt: "2026-10-07",
      }))
    )
    await database.insert(schema.rosterEntries).values([
      {
        teamId: 1,
        nickname: "a",
        matchedSteamid64: "a",
        scrapedAt: "2026-10-01",
      },
      {
        teamId: 2,
        nickname: "b",
        matchedSteamid64: "b",
        scrapedAt: "2026-10-01",
      },
      {
        teamId: 5,
        nickname: "c",
        matchedSteamid64: "c",
        scrapedAt: "2026-10-01",
      },
      {
        teamId: 3,
        nickname: "a",
        matchedSteamid64: "a",
        scrapedAt: "2026-10-07",
      },
      {
        teamId: 4,
        nickname: "b",
        matchedSteamid64: "b",
        scrapedAt: "2026-10-07",
      },
    ])
    await database.insert(schema.matches).values(
      [
        { id: 101 },
        { id: 102, teamAId: 2 },
        { id: 103, teamBId: 1 },
        { id: 104, teamAId: 1, teamBId: 2, teamAScore: 13, teamBScore: 7 },
        { id: 105, demoDate: "2026-10-02" },
        { id: 106 },
        { id: 107, teamAId: 1, teamBId: 2 },
        { id: 108, teamAId: 1, teamBId: 2, teamAScore: 9 },
        { id: 109 },
      ].map((match) => ({
        fileName: `regression-${match.id}.dem`,
        mapName: "de_nuke",
        parsedAt: "2026-10-07",
        demoDate: "2026-10-07",
        ...match,
      }))
    )
    await database.insert(schema.playerMatchStats).values(
      Array.from({ length: 8 }, (_, i) => 101 + i).flatMap((matchId) =>
        [
          { steamid64: "a", teamName: "3", kills: 20 },
          { steamid64: "b", teamName: "2", kills: 5 },
          ...(matchId === 106
            ? [{ steamid64: "c", teamName: "3", kills: 1 }]
            : []),
        ].map((player) => ({
          matchId,
          ...player,
          deaths: 1,
          assists: 0,
          headshotKills: 0,
          damageTotal: 100,
        }))
      )
    )
    await database.insert(schema.toornamentMatches).values([
      {
        toornamentMatchId: "map-result",
        scheduledAt: "2026-10-07",
        teamANameRaw: "Alpha",
        teamBNameRaw: "Beta",
        teamAScore: 13,
        teamBScore: 5,
        status: "completed",
        scrapedAt: "2026-10-07",
      },
      {
        toornamentMatchId: "series-result",
        scheduledAt: "2026-10-02",
        teamANameRaw: "Alpha",
        teamBNameRaw: "Beta",
        teamAScore: 2,
        teamBScore: 0,
        status: "completed",
        scrapedAt: "2026-10-07",
      },
    ])
    const history = await getDemoMatches(database)
    const row = (id: number) => {
      const match = history.find((match) => match.matchId === id)
      assert.ok(match)
      return match
    }
    assert.deepEqual(
      [row(101).teamAName, row(101).teamBName],
      ["Beta", "Alpha"]
    )
    assert.deepEqual(
      [
        row(102).teamAName,
        row(102).teamBName,
        row(103).teamAName,
        row(103).teamBName,
      ],
      ["Beta", "Alpha", "Beta", "Alpha"]
    )
    for (const match of history) {
      const detail = await getDemoMatchById(match.matchId, database)
      assert.ok(detail)
      for (const field of [
        "teamAId",
        "teamBId",
        "teamAName",
        "teamBName",
        "teamAScore",
        "teamBScore",
        "scoreSource",
      ] as const) {
        assert.equal(detail[field], match[field], `${match.matchId}: ${field}`)
      }
    }
    assert.deepEqual(
      [row(101).teamAScore, row(101).teamBScore, row(101).scoreSource],
      [5, 13, "official"]
    )
    assert.deepEqual(
      [row(104).teamAScore, row(104).teamBScore, row(104).scoreSource],
      [13, 7, "demo"]
    )
    assert.deepEqual(
      [row(105).teamAScore, row(105).teamBScore, row(105).scoreSource],
      [0, 2, "official"]
    )
    assert.deepEqual([row(106).teamAName, row(106).teamBName], ["Beta", null])
    assert.equal(row(106).scoreSource, null)
    const anchored = await getDemoMatchById(107, database)
    assert.deepEqual([anchored?.teamASide, anchored?.teamBSide], ["3", "2"])
    assert.deepEqual(
      [row(108).teamAScore, row(108).teamBScore, row(108).scoreSource],
      [9, null, "demo"]
    )
    assert.deepEqual([row(109).teamAName, row(109).teamBName], [null, null])
    const players = await getDemoMatchPlayerStats(101, database)
    assert.deepEqual(
      players.map((player) => player.rosterTeamName),
      ["Alpha", "Beta"]
    )
    const html = renderToStaticMarkup(
      createElement(
        FollowProvider,
        { teams: [] },
        createElement(MatchesView, { history, upcoming: [], divisions: ["1"] })
      )
    )
    assert.match(html, /Official result/)
    assert.match(html, /Demo score/)
    assert.match(html, /5-13/)
    assert.match(html, /0-2/)
    assert.match(html, /may describe a series instead/)
    const unassignedHtml = renderToStaticMarkup(
      createElement(
        FollowProvider,
        { teams: [] },
        createElement(DemoMatchView, {
          teamA: { name: "Alpha", score: null, players: [] },
          teamB: { name: "Unknown team B", score: null, players: [] },
          unassignedPlayers: players.map((player) => ({
            ...player,
            avatarUrl: null,
          })),
          kills: [],
          hiddenSteamids: [],
          mapImageUrl: null,
          radar: null,
        })
      )
    )
    assert.match(unassignedHtml, /Unassigned players/)
    assert.match(unassignedHtml, /href="\/players\/a"/)
    assert.match(unassignedHtml, /href="\/players\/b"/)
    assert.equal(await getDemoMatchById(999, database), null)
    assert.equal(
      await getToornamentScoreForDemo("invalid", "Alpha", "Beta", database),
      null
    )
    assert.equal(
      await getToornamentScoreForDemo("2026-11-01", "Alpha", "Beta", database),
      null
    )
    await database.insert(schema.toornamentMatches).values({
      toornamentMatchId: "equally-close-result",
      scheduledAt: "2026-10-07",
      teamANameRaw: "Alpha",
      teamBNameRaw: "Beta",
      teamAScore: 1,
      teamBScore: 13,
      status: "completed",
      scrapedAt: "2026-10-07",
    })
    const ambiguousResult = await getDemoMatchById(101, database)
    assert.deepEqual(
      [
        ambiguousResult?.teamAScore,
        ambiguousResult?.teamBScore,
        ambiguousResult?.scoreSource,
      ],
      [null, null, null]
    )
    assert.equal((await getDemoMatchById(104, database))?.teamAScore, 13)
    await database.insert(schema.toornamentMatches).values({
      toornamentMatchId: "similar-team-names",
      scheduledAt: "2026-10-20",
      teamANameRaw: "Gamma1",
      teamBNameRaw: "Gamma2",
      teamAScore: 13,
      teamBScore: 9,
      status: "completed",
      scrapedAt: "2026-10-20",
    })
    assert.deepEqual(
      await getToornamentScoreForDemo(
        "2026-10-20",
        "Gamma2",
        "Gamma1",
        database
      ),
      { teamAScore: 9, teamBScore: 13 }
    )
    assert.equal(
      await getToornamentScoreForDemo(
        "2026-10-20",
        "Gamma3",
        "Gamma4",
        database
      ),
      null
    )
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
    createElement(
      FollowProvider,
      { teams: [] },
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
            scoreSource: null,
          },
        ],
      })
    )
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

test("raw schedule fetch avoids a second cache layer and excludes completed matches", async (t) => {
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
  assert.equal(fetch.mock.calls[0].arguments[1]?.cache, "no-store")
  assert.ok(fetch.mock.calls[0].arguments[1]?.signal instanceof AbortSignal)
})

test("an empty live schedule is not an unavailable schedule", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('<div data-role="sch-calendar"></div>')
  )
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

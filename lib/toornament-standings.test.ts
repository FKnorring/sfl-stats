import assert from "node:assert/strict"
import { test } from "node:test"
import {
  parseStandingsWidget,
  resolveOfficialTeam,
} from "./toornament-standings"
import { extractCs2DivisionStages } from "./roster-extract"
import {
  getLiveDivisionStandings,
  getLivePendingMatches,
  getLiveTeamPendingMatches,
} from "./toornament-live"
import type { Block } from "./roster-types"

const labels = [
  "Played",
  "Wins",
  "Draws",
  "Losses",
  "Forfeits",
  "Score For",
  "Score Against",
  "Score Difference",
  "Points",
]
function ranking(order = labels) {
  const values: Record<string, number> = {
    Played: 2,
    Wins: 1,
    Draws: 0,
    Losses: 1,
    Forfeits: 0,
    "Score For": 18,
    "Score Against": 24,
    "Score Difference": -6,
    Points: 3,
  }
  return `<div class="ranking format-sheet"><div class="ranking-title">${order.map((key) => `<div class="metric"><abbr title="${key}"></abbr></div>`).join("")}</div><div class="ranking-item"><div class="rank">4</div><div class="name">Alpha</div>${order.map((key) => `<div class="metric">${values[key]}</div>`).join("")}</div></div>`
}
function block(contentType: string, fields: Record<string, unknown>): Block {
  return { system: { contentType }, fields }
}
const stagePath = "/tournaments/123/stages/456/?_locale=en_US"
const content = [
  block("contentBoxItem", {
    itemTitle: "SFL Säsong 9",
    itemContent: [
      block("contentBoxItem", {
        itemTitle: "Counter-Strike 2",
        itemContent: [
          block("headlineBlock", { headline: "Division 1" }),
          block("toornamentEmbedBlock", { embedPath: stagePath }),
          block("toornamentEmbedBlock", {
            embedPath: "/tournaments/123/matches/schedule/",
          }),
          block("toornamentEmbedBlock", {
            embedPath: "https://evil.example/stages/1/",
          }),
        ],
      }),
      block("contentBoxItem", {
        itemTitle: "Another game",
        itemContent: [
          block("headlineBlock", { headline: "Division 1" }),
          block("toornamentEmbedBlock", {
            embedPath: "/tournaments/789/stages/456/",
          }),
        ],
      }),
    ],
  }),
]
const team = {
  teamId: 1,
  teamName: "Alpha",
  season: "SFL Säsong 9",
  division: "Division 1",
}

test("official ranks and metrics survive reordered columns", () => {
  const normal = parseStandingsWidget(ranking())
  assert.equal(normal[0].rank, 4)
  assert.equal(normal[0].scoreDifference, -6)
  assert.equal(
    parseStandingsWidget(ranking().replace(">3<", ">-3<"))[0].points,
    -3
  )
  assert.deepEqual(parseStandingsWidget(ranking([...labels].reverse())), normal)
  assert.throws(() => parseStandingsWidget(""), /ranking/)
  assert.throws(
    () => parseStandingsWidget(ranking().replace("Score For", "Changed")),
    /columns/
  )
  assert.throws(
    () => parseStandingsWidget(ranking().replace(">18<", ">NaN<")),
    /statistic/
  )
  assert.throws(
    () => parseStandingsWidget(ranking().replace(">18<", ">-18<")),
    /Negative/
  )
})

test("division discovery is season/game scoped and rejects schedule/arbitrary origins", () => {
  assert.deepEqual(extractCs2DivisionStages(content), [
    { season: team.season, division: team.division, path: stagePath },
  ])
})

test("official team matching rejects normalized/fuzzy ties and unknown teams", () => {
  assert.equal(resolveOfficialTeam("ALPHA", [team])?.teamId, 1)
  assert.equal(
    resolveOfficialTeam("Alpha", [team, { ...team, teamId: 2 }]),
    null
  )
  assert.equal(
    resolveOfficialTeam("Acme Team", [
      { ...team, teamName: "Acme Teams" },
      { ...team, teamId: 2, teamName: "Acme Teamo" },
    ]),
    null
  )
  assert.equal(resolveOfficialTeam("Unrelated", [team]), null)
})

test("live ranking fetch uses discovered stage, retains official rank and unresolved names", async (t) => {
  const page = `RootComponent, ${JSON.stringify({ pageContent: { fields: { contentArea: content } } })}`
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request) =>
      new Response(String(url).includes("publiclir.se") ? page : ranking())
  )
  const result = await getLiveDivisionStandings(team, [team])
  assert.equal(result.rows[0].rank, 4)
  assert.equal(result.rows[0].teamId, 1)
  assert.equal(result.error, null)
  assert.equal(result.sourceUrl, `https://widget.toornament.com${stagePath}`)
  assert.equal(fetch.mock.callCount(), 2)
  const missing = await getLiveDivisionStandings(
    { ...team, teamName: "Unknown" },
    [{ ...team, teamName: "Unknown" }]
  )
  assert.equal(missing.rows[0].teamId, null)
  assert.match(missing.error!, /confidently/)
})

test("HTTP, timeout and malformed ranking failures are explicitly unavailable", async (t) => {
  t.mock.method(console, "error", () => {})
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 503 })
  )
  assert.match(
    (await getLiveDivisionStandings(team, [team])).error!,
    /unavailable/
  )
  fetch.mock.mockImplementation(async () => {
    throw new DOMException("timeout", "TimeoutError")
  })

  assert.equal((await getLiveDivisionStandings(team, [team])).rows.length, 0)
  fetch.mock.mockImplementation(
    async () => new Response("<html>unexpected page</html>")
  )
  assert.equal(await getLivePendingMatches(), null)
})

test("multiple official rows cannot claim the same local team identity", async (t) => {
  const page = `RootComponent, ${JSON.stringify({ pageContent: { fields: { contentArea: content } } })}`
  const widget = ranking()
  const row = widget.slice(widget.indexOf('<div class="ranking-item">'), -6)
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request) =>
      new Response(
        String(url).includes("publiclir.se")
          ? page
          : widget.slice(0, -6) + row + "</div>"
      )
  )
  const result = await getLiveDivisionStandings(team, [team])
  assert.equal(result.rows.length, 2)
  assert.ok(result.rows.every((row) => row.teamId === null))
  assert.match(result.error!, /confidently/)
})

test("follow schedule uses the discovered season's tournament rather than a fixed default", async (t) => {
  const page = `RootComponent, ${JSON.stringify({ pageContent: { fields: { contentArea: content } } })}`
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request) =>
      new Response(
        String(url).includes("publiclir.se")
          ? page
          : '<div data-role="sch-calendar"></div>'
      )
  )
  assert.deepEqual(await getLiveTeamPendingMatches(team), [])
  assert.match(
    String(fetch.mock.calls[1].arguments[0]),
    /tournaments\/123\/matches\/schedule/
  )
})

test("malformed schedule events are unavailable, while a genuinely empty widget is valid", async (t) => {
  t.mock.method(console, "error", () => {})
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        "<div data-role='sch-event'><div class='match' data-type='match'></div></div>"
      )
  )
  assert.equal(await getLivePendingMatches(), null)
  fetch.mock.mockImplementation(
    async () => new Response("<div data-role='sch-calendar'></div>")
  )
  assert.deepEqual(await getLivePendingMatches(), [])
})

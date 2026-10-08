import assert from "node:assert/strict"
import test from "node:test"
import { extractTwitchUrls, parseStreamMessage } from "./stream-message"
import type { UpcomingMatchRow } from "./matches"

function match(matchId: string, a: string, b: string): UpcomingMatchRow {
  return {
    matchId,
    scheduledAt: null,
    teamAName: a,
    teamBName: b,
    teamADivision: null,
    teamBDivision: null,
  }
}

const upcoming = [
  match("1", "Netlight", "Spotify"),
  match("2", "Klarna", "King"),
  match("3", "Volvo", "Ericsson"),
]

test("extracts and normalizes twitch links, ignoring other sites", () => {
  assert.deepEqual(
    extractTwitchUrls(
      "<https://twitch.tv/SFL_Sweden> x https://www.twitch.tv/videos/123 https://youtube.com/c/foo"
    ),
    ["https://www.twitch.tv/sfl_sweden"]
  )
})

test("link on the same line as the teams", () => {
  const r = parseStreamMessage(
    "Tonight: **Netlight** vs **Spotify** 20:00 https://twitch.tv/sflcs",
    upcoming
  )
  assert.deepEqual(r.assignments, [
    {
      matchId: "1",
      teamAName: "Netlight",
      teamBName: "Spotify",
      url: "https://www.twitch.tv/sflcs",
      caster: null,
    },
  ])
})

test("works when the teams are in reverse order and link is on the next line", () => {
  const r = parseStreamMessage(
    "spotify - netlight\nWatch at twitch.tv/sflcs",
    upcoming
  )
  assert.equal(r.assignments[0]?.matchId, "1")
  assert.equal(r.assignments[0]?.url, "https://www.twitch.tv/sflcs")
})

test("several matches in blocks, each with its own link", () => {
  const r = parseStreamMessage(
    "Klarna vs King\nhttps://twitch.tv/one\n\nVolvo vs Ericsson https://twitch.tv/two",
    upcoming
  )
  assert.deepEqual(
    r.assignments.map((a) => [a.matchId, a.url]),
    [
      ["2", "https://www.twitch.tv/one"],
      ["3", "https://www.twitch.tv/two"],
    ]
  )
})

test("a single link below a list of teams applies to the block's only link", () => {
  const r = parseStreamMessage(
    "Klarna vs King\nhttps://twitch.tv/one",
    upcoming
  )
  assert.equal(r.assignments.length, 1)
})

test("no link means no assignment", () => {
  const r = parseStreamMessage("Netlight vs Spotify tonight", upcoming)
  assert.deepEqual(r.assignments, [])
  assert.deepEqual(r.unmatched, ["Netlight vs Spotify tonight"])
})

test("a link with no recognizable teams is reported as unmatched", () => {
  const r = parseStreamMessage("Foo vs Bar https://twitch.tv/xyz", upcoming)
  assert.deepEqual(r.assignments, [])
  assert.deepEqual(r.unmatched, ["Foo vs Bar https://twitch.tv/xyz"])
})

test("commentator applies to every match on the channel", () => {
  const r = parseStreamMessage(
    `20:00 | Division 2A
Netlight vs. Spotify
📺 twitch.tv/publiclirtv

21:00 | Division 2A
Klarna vs. King
📺 twitch.tv/publiclirtv
🎙️ Kommentator: Dennis "@DennisSandén"  Sandén

20:00 | Division 2B
Volvo vs. Ericsson
📺 twitch.tv/publiclirtv2`,
    upcoming
  )
  assert.deepEqual(
    r.assignments.map((a) => a.caster),
    ['Dennis "DennisSandén" Sandén', 'Dennis "DennisSandén" Sandén', null]
  )
})

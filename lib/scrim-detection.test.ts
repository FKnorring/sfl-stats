import assert from "node:assert/strict"
import test from "node:test"
import { isScrim, type CompletedToornamentMatch } from "./scrim-detection"

const DAY = 24 * 60 * 60 * 1000
const base = Date.parse("2026-10-10T18:00:00Z")
const iso = (offsetDays: number) =>
  new Date(base + offsetDays * DAY).toISOString()

const official = (scheduledAt: string): CompletedToornamentMatch => ({
  scheduledAt,
  teamAId: 1,
  teamBId: 2,
  teamAName: "Alpha Wolves",
  teamBName: "Beta Bears",
})
const demo = (over = {}) => ({
  demoDate: iso(0),
  teamAId: 1,
  teamBId: 2,
  teamAName: "Alpha Wolves",
  teamBName: "Beta Bears",
  ...over,
})

test("no Toornament results means scrim", () => {
  assert.equal(isScrim(demo(), []), true)
})

test("match within a week is official, outside is a scrim", () => {
  assert.equal(isScrim(demo(), [official(iso(6))]), false)
  assert.equal(isScrim(demo(), [official(iso(-6))]), false)
  assert.equal(isScrim(demo(), [official(iso(8))]), true)
})

test("matches by names when ids are missing, either orientation", () => {
  const d = demo({ teamAId: null, teamBId: null })
  assert.equal(isScrim(d, [official(iso(1))]), false)
  const swapped = demo({
    teamAId: null,
    teamBId: null,
    teamAName: "Beta Bears",
    teamBName: "Alpha Wolves",
  })
  assert.equal(isScrim(swapped, [official(iso(1))]), false)
})

test("a demo with one resolved team matches on that team", () => {
  assert.equal(isScrim(demo({ teamBId: null }), [official(iso(1))]), false)
})

test("other teams' matches do not count", () => {
  const other = {
    ...official(iso(0)),
    teamAId: 8,
    teamBId: 9,
    teamAName: "Zed",
    teamBName: "Yak",
  }
  assert.equal(isScrim(demo(), [other]), true)
})

test("unparseable date: hidden only when no team resolved", () => {
  assert.equal(isScrim(demo({ demoDate: null }), []), false)
  assert.equal(
    isScrim(demo({ demoDate: null, teamAId: null, teamBId: null }), []),
    true
  )
})

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

test("resolved ids are authoritative: similar names do not make a scrim official", () => {
  // Demo is Mathem (8) vs Fortnox (3); the only result is CGI (4) vs Fortnox
  // (3). "CGI Sverige AB" is fuzzy-close to "MatHem i Sverige AB".
  const result = {
    ...official(iso(0)),
    teamAId: 4,
    teamBId: 3,
    teamAName: "CGI Sverige AB",
    teamBName: "Fortnox AB",
  }
  const d = demo({
    teamAId: 8,
    teamBId: 3,
    teamAName: "MatHem i Sverige AB",
    teamBName: "Fortnox AB",
  })
  assert.equal(isScrim(d, [result]), true)
  assert.equal(isScrim(d, [{ ...result, teamAId: 8 }]), false)
})

test("unparseable date: hidden only when no team resolved", () => {
  assert.equal(isScrim(demo({ demoDate: null }), []), false)
  assert.equal(
    isScrim(demo({ demoDate: null, teamAId: null, teamBId: null }), []),
    true
  )
})

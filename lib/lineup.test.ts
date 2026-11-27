import assert from "node:assert/strict"
import { test } from "node:test"
import { pickMostPlayedLineup, resolveNicknames } from "./lineup"

test("pickMostPlayedLineup prefers the most frequent exact set", () => {
  const best = pickMostPlayedLineup([
    { matchId: 1, steamids: ["a", "b", "c"] },
    { matchId: 2, steamids: ["c", "b", "a"] },
    { matchId: 3, steamids: ["a", "b", "d"] },
  ])
  assert.deepEqual(best, { steamids: ["a", "b", "c"], count: 2 })
})

test("pickMostPlayedLineup breaks ties by recency and handles empty", () => {
  const best = pickMostPlayedLineup([
    { matchId: 1, steamids: ["a", "b"] },
    { matchId: 2, steamids: ["a", "c"] },
  ])
  assert.deepEqual(best?.steamids, ["a", "c"])
  assert.equal(pickMostPlayedLineup([]), null)
})

test("resolveNicknames matches nickname or in-game name, in order", () => {
  const roster = [
    { nickname: "xelos", inGameName: "MentorN XD" },
    { nickname: "forsan", inGameName: "forsan" },
  ]
  assert.deepEqual(
    resolveNicknames(["FORSAN", "mentorn xd", "ghost"], roster).map(
      (p) => p.nickname
    ),
    ["forsan", "xelos"]
  )
})

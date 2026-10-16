import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateHltvRating, HLTV_RATING_VERSION } from "./hltv-rating"
import type { RatingInput } from "./player-rating"

const empty: RatingInput = {
  kills: 0,
  weightedKills: 0,
  ecoKills: 0,
  deaths: 0,
  assists: 0,
  flashAssists: 0,
  headshotKills: 0,
  damage: 0,
  utilityDamage: 0,
  survived: false,
  traded: false,
  openingKills: 0,
  openingDeaths: 0,
  clutchWins: 0,
  clutchOpponents: 0,
}

test("hltv rating matches the hand-computed formula", () => {
  // 4 rounds: 2 kills + 1 death + 1 assist + 100 dmg in round 1, rest idle deaths.
  const facts: RatingInput[] = [
    { ...empty, kills: 2, assists: 1, damage: 200, survived: true },
    { ...empty, deaths: 1, damage: 100, traded: true },
    { ...empty, deaths: 1 },
    { ...empty, survived: true },
  ]
  const kast = 75
  const kpr = 0.5
  const dpr = 0.5
  const apr = 0.25
  const adr = 75
  const impact = 2.13 * kpr + 0.42 * apr - 0.41
  const expected =
    0.0073 * kast +
    0.3591 * kpr -
    0.5329 * dpr +
    0.2372 * impact +
    0.0032 * adr +
    0.1587
  const result = calculateHltvRating(facts)
  assert.ok(Math.abs(result.rating - expected) < 1e-9)
  assert.equal(result.version, HLTV_RATING_VERSION)
  assert.equal(result.rounds, 4)
  assert.equal(result.kast, kast)
})

test("hltv rating uses raw kills, counts flash assists, and rejects bad input", () => {
  const a = calculateHltvRating([{ ...empty, kills: 1, weightedKills: 0.6 }])
  const b = calculateHltvRating([{ ...empty, kills: 1, weightedKills: 1 }])
  assert.equal(a.rating, b.rating)
  assert.equal(calculateHltvRating([{ ...empty, flashAssists: 1 }]).apr, 1)
  assert.throws(() => calculateHltvRating([]))
  assert.throws(() => calculateHltvRating([{ ...empty, kills: -1 }]))
})

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import {
  deriveRatingFacts,
  isEcoKill,
  killWeight,
  extractRatingFacts,
  type RatingEvent,
  type RatingSnapshot,
} from "./demo-rating"
import {
  calculatePlayerRating,
  ratingMetrics,
  RATING_REFERENCE,
  RATING_WEIGHTS,
  type RatingInput,
} from "./player-rating"
import corpus from "../data/rating-v1-reference.json"

const ids = [
  "76561198000000001",
  "76561198000000002",
  "76561198000000003",
  "76561198000000004",
]
const empty: RatingInput = {
  kills: 0,
  weightedKills: 0,
  ecoKills: 0,
  deaths: 1,
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

function fixture() {
  const events: RatingEvent[] = []
  const snapshots: RatingSnapshot[] = []
  for (let round = 0; round < 13; round++) {
    const tick = round * 1000
    events.push(
      {
        event_name: "round_start",
        tick,
        total_rounds_played: round,
        is_warmup_period: false,
      },
      {
        event_name: "round_freeze_end",
        tick: tick + 10,
        total_rounds_played: round,
        is_warmup_period: false,
      },
      {
        event_name: "round_end",
        tick: tick + 900,
        total_rounds_played: round + 1,
        is_warmup_period: false,
        winner: "T",
        game_phase: round === 12 ? 5 : 2,
      }
    )
    for (const snapshotTick of [tick + 10, tick + 900]) {
      snapshots.push(
        ...ids.map((id, index) => ({
          tick: snapshotTick,
          player_steamid: id,
          player_name: id,
          team_num: index < 2 ? 2 : 3,
          is_alive: true,
          health: 100,
          round_start_equip_value: 3000,
        }))
      )
    }
  }
  return { events, snapshots }
}

function kill(
  tick: number,
  attacker: number | null,
  victim: number,
  extra: Partial<RatingEvent> = {}
): RatingEvent {
  return {
    event_name: "player_death",
    tick,
    game_time: tick / 64,
    is_warmup_period: false,
    attacker_steamid: attacker === null ? null : ids[attacker],
    attacker_team_num: attacker === null ? null : attacker < 2 ? 2 : 3,
    user_steamid: ids[victim],
    user_team_num: victim < 2 ? 2 : 3,
    assistedflash: false,
    ...extra,
  }
}

function withDeaths(events: RatingEvent[], victims: number[]) {
  const data = fixture()
  data.events.push(...events)
  for (const victim of victims)
    data.snapshots.find(
      (s) => s.tick === 900 && s.player_steamid === ids[victim]
    )!.is_alive = false
  return data
}

test("score golden example, empty input, invalid input and KAST union", () => {
  assert.equal(calculatePlayerRating([empty]).rating, 0)
  const sample = {
    ...empty,
    kills: 2,
    weightedKills: 2,
    damage: 150,
    survived: true,
    traded: true,
    assists: 1,
    flashAssists: 1,
    utilityDamage: 10,
    openingKills: 1,
    clutchWins: 1,
  }
  const result = calculatePlayerRating([sample])
  assert.equal(result.kast, 1)
  assert.equal(result.assists, 2)
  const expected =
    (0.25 * 2) / RATING_REFERENCE.combat +
    (0.2 * 150) / RATING_REFERENCE.damage +
    0.2 / RATING_REFERENCE.consistency +
    0.1 / RATING_REFERENCE.survival +
    0.05 *
      (1 / RATING_REFERENCE.multiKill +
        1 / RATING_REFERENCE.opening +
        1 / RATING_REFERENCE.clutch) +
    (0.1 / 3) *
      (1 / RATING_REFERENCE.assist +
        1 / RATING_REFERENCE.flash +
        10 / RATING_REFERENCE.utility)
  assert.ok(Math.abs(result.rating - expected) < 1e-12)
  assert.throws(() => calculatePlayerRating([]), /no participated rounds/)
  assert.throws(
    () => calculatePlayerRating([{ ...empty, damage: NaN }]),
    /Invalid rating fact/
  )
  assert.throws(
    () => calculatePlayerRating([{ ...empty, damage: -1 }]),
    /Invalid rating fact/
  )
  assert.equal(
    Object.values(RATING_WEIGHTS).reduce((a, b) => a + b, 0),
    1
  )
  for (const change of [
    { kills: 1 },
    { damage: 10 },
    { survived: true },
    { traded: true },
    { assists: 1 },
    { flashAssists: 1 },
    { utilityDamage: 5 },
    { openingKills: 1 },
    { clutchWins: 1 },
  ]) {
    assert.ok(calculatePlayerRating([{ ...empty, ...change }]).rating > 0)
  }
  assert.ok(
    calculatePlayerRating([{ ...sample, survived: false }]).rating <
      result.rating
  )
})

test("canonical rounds ignore the initial null outcome, warmup and post-round kills", () => {
  const data = fixture()
  data.events.push({
    event_name: "round_end",
    tick: 0,
    winner: null,
    is_warmup_period: false,
  })
  data.events.push(kill(5, 0, 2), kill(950, 0, 2))
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  assert.equal(result.rounds.length, 13)
  assert.equal(
    result.facts.reduce((n, f) => n + f.kills, 0),
    0
  )
  assert.equal(
    calculatePlayerRating(result.facts.filter((f) => f.steamid64 === ids[0]))
      .kast,
    1
  )
})

test("trades include exactly three seconds, enemy openings, multi-kills and bomb clutch wins", () => {
  const data = withDeaths(
    [
      kill(100, 0, 2),
      kill(200, 3, 1, { game_time: 10 }),
      kill(300, 0, 3, { game_time: 13 }),
    ],
    [2, 1, 3]
  )
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  const a = result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[0])!
  const b = result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[1])!
  assert.equal(a.kills, 2)
  assert.equal(a.openingKills, 1)
  assert.equal(a.clutchWins, 1)
  assert.equal(a.clutchOpponents, 1)
  assert.equal(b.traded, true)
  data.events.find((e) => e.tick === 300)!.game_time = 13.0001
  assert.equal(
    deriveRatingFacts(data.events, data.snapshots).facts.find(
      (f) => f.ordinal === 0 && f.steamid64 === ids[1]
    )!.traded,
    false
  )
})

test("world/team deaths are not combat, friendly assists do not earn support", () => {
  const data = withDeaths(
    [
      kill(100, 0, 2, { assister_steamid: ids[3], assister_team_num: 3 }),
      kill(200, 0, 1),
      kill(300, null, 0),
    ],
    [2, 1, 0]
  )
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  assert.equal(
    result.facts
      .filter((f) => f.ordinal === 0)
      .reduce((n, f) => n + f.kills, 0),
    1
  )
  assert.equal(
    result.facts.reduce((n, f) => n + f.assists + f.flashAssists, 0),
    0
  )
  assert.equal(
    result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[1])!.traded,
    false
  )
})

test("flash assists are disjoint, damage is capped, utility is attributed", () => {
  const data = withDeaths(
    [
      {
        ...kill(100, 0, 2),
        event_name: "player_hurt",
        dmg_health: 150,
        user_health: 40,
        health: 0,
        weapon: "hegrenade",
      },
      kill(101, 0, 2, {
        assister_steamid: ids[1],
        assister_team_num: 2,
        assistedflash: true,
      }),
    ],
    [2]
  )
  data.snapshots.find(
    (s) => s.tick === 10 && s.player_steamid === ids[2]
  )!.health = 40
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  const a = result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[0])!
  const b = result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[1])!
  assert.equal(a.damage, 40)
  assert.equal(a.utilityDamage, 40)
  assert.equal(b.flashAssists, 1)
  assert.equal(b.assists, 0)
  assert.equal(ratingMetrics(b).consistency, 1)
})

test("same-tick hits use ordered health transitions rather than stale tick health", () => {
  const data = withDeaths(
    [
      {
        ...kill(100, 0, 2),
        event_name: "player_hurt",
        dmg_health: 70,
        health: 30,
        user_health: 100,
      },
      {
        ...kill(100, 1, 2),
        event_name: "player_hurt",
        dmg_health: 80,
        health: 0,
        user_health: 100,
      },
      kill(100, 1, 2),
    ],
    [2]
  )
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  assert.equal(
    result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[0])!.damage,
    70
  )
  assert.equal(
    result.facts.find((f) => f.ordinal === 0 && f.steamid64 === ids[1])!.damage,
    30
  )
})

test("invalid boundaries, short recordings, missing identity/snapshots stay unrated", () => {
  const short = fixture()
  short.events.at(-1)!.game_phase = 2
  assert.match(
    deriveRatingFacts(short.events, short.snapshots).unavailableReason!,
    /Incomplete/
  )
  const restarted = fixture()
  restarted.events.find(
    (e) => e.event_name === "round_end"
  )!.total_rounds_played = 2
  assert.match(
    deriveRatingFacts(restarted.events, restarted.snapshots).unavailableReason!,
    /boundaries/
  )
  const missing = fixture()
  missing.snapshots = missing.snapshots.filter((s) => s.tick !== 900)
  assert.match(
    deriveRatingFacts(missing.events, missing.snapshots).unavailableReason!,
    /survival snapshot/
  )
  const duplicateStart = fixture()
  duplicateStart.events.push({ ...duplicateStart.events[0], tick: 1 })
  assert.match(
    deriveRatingFacts(duplicateStart.events, duplicateStart.snapshots)
      .unavailableReason!,
    /boundaries/
  )
  const bot = fixture()
  bot.snapshots[0].player_steamid = null
  assert.match(
    deriveRatingFacts(bot.events, bot.snapshots).unavailableReason!,
    /bot/
  )
  const unknown = withDeaths(
    [kill(100, 0, 2, { user_steamid: "76561198000000999" })],
    []
  )
  assert.match(
    deriveRatingFacts(unknown.events, unknown.snapshots).unavailableReason!,
    /participant identity/
  )
})

test("participation is per player and observed halftime sides are not guessed", () => {
  const data = fixture()
  data.snapshots = data.snapshots.filter(
    (s) => !(s.tick >= 1000 && s.player_steamid === ids[1])
  )
  for (const row of data.snapshots.filter((s) => s.tick >= 12000))
    row.team_num = row.team_num === 2 ? 3 : 2
  const result = deriveRatingFacts(data.events, data.snapshots)
  assert.equal(result.unavailableReason, null)
  assert.equal(result.facts.filter((f) => f.steamid64 === ids[1]).length, 1)
  assert.equal(
    result.facts.find((f) => f.ordinal === 12 && f.steamid64 === ids[0])!.side,
    3
  )
})

test(
  "original SFL corpus reproduces frozen normalizers and mean",
  {
    skip: !process.env.SFL_RATING_DEMOS,
  },
  () => {
    const root = process.env.SFL_RATING_DEMOS!
    const paths = new Map(
      fs
        .readdirSync(root, { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".dem"))
        .map((f) => [path.basename(f).normalize("NFC"), path.join(root, f)])
    )
    const facts = corpus.demos.flatMap((name) => {
      const file = paths.get(name.normalize("NFC"))
      assert.ok(file, `Missing reference demo ${name}`)
      const result = extractRatingFacts(file)
      assert.equal(result.unavailableReason, null, name)
      return result.facts
    })
    assert.equal(facts.length, corpus.playerRounds)
    for (const [key, reference] of Object.entries(RATING_REFERENCE)) {
      const average =
        facts.reduce(
          (sum, f) =>
            sum + ratingMetrics(f)[key as keyof typeof RATING_REFERENCE],
          0
        ) / facts.length
      assert.ok(Math.abs(average - reference) < 1e-12, key)
    }
    assert.ok(Math.abs(calculatePlayerRating(facts).rating - 1) < 1e-12)
  }
)

test("kills against a poorer team are discounted, with a floor and a cap", () => {
  assert.equal(killWeight(4000, 4000), 1)
  assert.equal(killWeight(4000, 6000), 1)
  assert.equal(killWeight(4000, 3200), 0.8)
  assert.equal(killWeight(4000, 400), 0.6)
  assert.equal(killWeight(null, 3000), 1)
  assert.equal(killWeight(3000, null), 1)
  assert.equal(killWeight(0, 0), 1)
})

test("eco kills need an eco victim team facing a non-eco killer team", () => {
  assert.equal(isEcoKill(4000, 2000), true)
  assert.equal(isEcoKill(4000, 800), true)
  assert.equal(isEcoKill(4000, 2001), false)
  assert.equal(isEcoKill(2500, 2600), false)
  assert.equal(isEcoKill(800, 800), false)
  assert.equal(isEcoKill(null, 500), false)
  assert.equal(isEcoKill(4000, null), false)
})

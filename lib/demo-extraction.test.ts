import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"

import { bombPlantRowSchema } from "../scripts/demos/domain/demo-stats"
import {
  countPlayedRounds,
  normalizeBombPlants,
  normalizeKillFacts,
} from "../scripts/demos/domain/demo-extraction"

test("normalizes parser kill rows into persistence facts", () => {
  assert.deepEqual(
    normalizeKillFacts([
      {
        tick: 42,
        total_rounds_played: 3,
        attacker_steamid: "76561198000000001",
        attacker_X: 12,
        attacker_Y: 34,
        attacker_team_name: "CT",
        user_steamid: "76561198000000002",
        user_X: 56,
        user_Y: 78,
        user_team_name: "TERRORIST",
        weapon: "ak47",
        headshot: true,
      },
      {
        tick: 99,
        total_rounds_played: null,
        attacker_steamid: null,
        attacker_X: null,
        attacker_Y: null,
        attacker_team_name: null,
        user_steamid: null,
        user_X: null,
        user_Y: null,
        user_team_name: null,
        weapon: null,
        headshot: null,
      },
    ]),
    [
      {
        round: 3,
        tick: 42,
        attackerSteamid64: "76561198000000001",
        attackerX: 12,
        attackerY: 34,
        attackerSide: "CT",
        victimSteamid64: "76561198000000002",
        victimX: 56,
        victimY: 78,
        victimSide: "T",
        weapon: "ak47",
        headshot: true,
      },
      {
        round: 0,
        tick: 99,
        attackerSteamid64: null,
        attackerX: null,
        attackerY: null,
        attackerSide: null,
        victimSteamid64: null,
        victimX: null,
        victimY: null,
        victimSide: null,
        weapon: null,
        headshot: null,
      },
    ]
  )
})

test("normalizes bomb plants with site, round winner, and CT players", () => {
  const plants = z.array(bombPlantRowSchema).parse([
    {
      tick: 150,
      total_rounds_played: 2,
      user_steamid: "76561198000000001",
      user_last_place_name: "BombsiteA",
    },
    {
      tick: 250,
      total_rounds_played: 3,
      user_steamid: null,
      user_last_place_name: "Unknown",
    },
  ])
  assert.deepEqual(
    normalizeBombPlants(
      plants,
      [
        { tick: 200, winner: "T" },
        { tick: 300, winner: "CT" },
      ],
      [
        { tick: 150, player_steamid: "76561198000000002", team_name: "CT" },
        {
          tick: 150,
          player_steamid: "76561198000000003",
          team_name: "TERRORIST",
        },
      ]
    ),
    [
      {
        round: 2,
        tick: 150,
        planterSteamid64: "76561198000000001",
        site: "A",
        placeName: "BombsiteA",
        roundWinnerSide: "T",
        ctSteamids64: ["76561198000000002"],
      },
      {
        round: 3,
        tick: 250,
        planterSteamid64: null,
        site: null,
        placeName: "Unknown",
        roundWinnerSide: "CT",
        ctSteamids64: [],
      },
    ]
  )
})

test("counts only rounds with a winner, ignoring the tick-0 round_end", () => {
  assert.equal(
    countPlayedRounds([
      { tick: 0, winner: null },
      { tick: 100, winner: "T" },
      { tick: 200, winner: "CT" },
    ]),
    2
  )
  assert.equal(
    countPlayedRounds([
      { tick: 100, winner: "T" },
      { tick: 200, winner: "CT" },
    ]),
    2
  )
})

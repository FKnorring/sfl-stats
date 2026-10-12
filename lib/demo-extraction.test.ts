import assert from "node:assert/strict"
import { test } from "node:test"

import { normalizeKillFacts } from "../scripts/demos/domain/demo-extraction"

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

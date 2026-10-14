import { parseEvents, parseTicks } from "@laihoe/demoparser2"
import { z } from "zod"

import {
  deriveEcoFragsAtDeath,
  type DeathTimeSnapshot,
} from "../../lib/eco-frags-death-time"
import { ratingEventSchema, type RatingEvent } from "../../lib/demo-rating"

// Usage: node --import tsx scripts/demos/eco-frags-report.ts <file.dem> [--killers <steamid64,...>]
// Read-only: prints eco frags with the victim's (enemy's) loadout at death.
// --killers keeps only frags where the killer's SteamID is in the list.
const filePath = process.argv[2]
if (!filePath)
  throw new Error(
    "usage: eco-frags-report.ts <file.dem> [--killers <steamid64,...>]"
  )
const killersIdx = process.argv.indexOf("--killers")
const killerFilter =
  killersIdx !== -1 ? new Set(process.argv[killersIdx + 1]?.split(",")) : null

const events: RatingEvent[] = z
  .array(ratingEventSchema)
  .parse(
    parseEvents(
      filePath,
      ["begin_new_match", "round_freeze_end", "round_end", "player_death"],
      ["team_num", "health"],
      [
        "total_rounds_played",
        "is_warmup_period",
        "game_phase",
        "game_time",
        "winner",
        "weapon",
      ]
    )
  )

// Also sample the tick before each death: the victim is dead at the death
// tick, so their last living loadout is one tick earlier.
const deathTicks = [
  ...new Set(
    events
      .filter((e) => e.event_name === "player_death")
      .flatMap((e) => [e.tick, e.tick - 1])
  ),
]
const freezeTicks = events
  .filter((e) => e.event_name === "round_freeze_end")
  .map((e) => e.tick)
const ticks = [...new Set([...deathTicks, ...freezeTicks])]

const snapshots = parseTicks(
  filePath,
  [
    "player_steamid",
    "player_name",
    "team_num",
    "is_alive",
    "current_equip_value",
    "inventory",
    "active_weapon_name",
  ],
  ticks
) as unknown as DeathTimeSnapshot[]

const frags = deriveEcoFragsAtDeath(events, snapshots).filter(
  (f) => !killerFilter || killerFilter.has(f.killerSteamid64)
)
const side = (s: number) => (s === 2 ? "T" : "CT")
for (const f of frags) {
  console.log(
    `R${f.round} t=${f.tick}  ${f.killerName} (${side(f.killerSide)}, team ${Math.round(f.killerTeamEquip ?? -1)}) ` +
      `killed ${f.victimName} (${side(f.victimSide)}, equip ${Math.round(f.victimEquip ?? -1)})` +
      `weapon=${f.weapon ?? "?"}  victim loadout=[${f.victimInventory.join(", ")}] active=${f.victimActiveWeapon ?? "?"}`
  )
}
console.log(`${frags.length} eco frags`)

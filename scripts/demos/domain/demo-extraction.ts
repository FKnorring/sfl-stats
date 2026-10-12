import {
  parseEvent,
  parseEvents,
  parseHeader,
  parseTicks,
} from "@laihoe/demoparser2"
import { z } from "zod"

import {
  deriveRatingFacts,
  ratingEventSchema,
  ratingSnapshotSchema,
  type RatingExtraction,
} from "../../../lib/demo-rating"
import {
  STAT_FIELDS,
  deriveStats,
  isMatchComplete,
  killRowSchema,
  roundEndRowSchema,
  tickRowSchema,
  type DerivedPlayerStats,
  type KillRow,
  type RoundEndRow,
} from "./demo-stats"

type DemoHeader = Record<string, string>

export type DemoFacts =
  | { status: "no-rounds"; header: DemoHeader }
  | { status: "incomplete"; header: DemoHeader; roundEnds: RoundEndRow[] }
  | {
      status: "ready"
      header: DemoHeader
      roundEnds: RoundEndRow[]
      totalRounds: number
      players: (DerivedPlayerStats | null)[]
      killFacts: DemoKillFact[]
      ratingFacts: RatingExtraction
    }

export type DemoKillFact = {
  round: number
  tick: number
  attackerSteamid64: string | null
  attackerX: number | null
  attackerY: number | null
  attackerSide: "CT" | "T" | null
  victimSteamid64: string | null
  victimX: number | null
  victimY: number | null
  victimSide: "CT" | "T" | null
  weapon: string | null
  headshot: boolean | null
}

export function extractRatingFacts(filePath: string): RatingExtraction {
  const events = z
    .array(ratingEventSchema)
    .parse(
      parseEvents(
        filePath,
        [
          "begin_new_match",
          "round_start",
          "round_freeze_end",
          "round_end",
          "player_death",
          "player_hurt",
        ],
        ["team_num", "health"],
        ["total_rounds_played", "is_warmup_period", "game_phase", "game_time"]
      )
    )
  const ticks = [
    ...new Set(
      events
        .filter(
          (event) =>
            event.event_name === "round_freeze_end" ||
            event.event_name === "round_end"
        )
        .map((event) => event.tick)
    ),
  ]
  const snapshots = z
    .array(ratingSnapshotSchema)
    .parse(
      parseTicks(
        filePath,
        [
          "player_steamid",
          "player_name",
          "team_num",
          "is_alive",
          "health",
          "round_start_equip_value",
        ],
        ticks
      )
    )
  return deriveRatingFacts(events, snapshots)
}

function toSide(name: string | null | undefined): "CT" | "T" | null {
  if (name === "CT") return "CT"
  if (name === "TERRORIST") return "T"
  return null
}

export function extractRoundEnds(filePath: string): RoundEndRow[] {
  return z
    .array(roundEndRowSchema)
    .parse(parseEvent(filePath, "round_end") as unknown[])
}

export function extractDemoFacts(filePath: string): DemoFacts {
  const header = parseHeader(filePath) as DemoHeader
  const roundEnds = extractRoundEnds(filePath)
  if (roundEnds.length === 0) return { status: "no-rounds", header }
  if (!isMatchComplete(roundEnds)) {
    return { status: "incomplete", header, roundEnds }
  }

  const totalRounds = roundEnds.length
  const gameEndTick = Math.max(...roundEnds.map((round) => round.tick))
  const tickRows = z
    .array(tickRowSchema)
    .parse(parseTicks(filePath, [...STAT_FIELDS], [gameEndTick]) as unknown[])

  return {
    status: "ready",
    header,
    roundEnds,
    totalRounds,
    players: tickRows.map((row) => deriveStats(row, totalRounds)),
    killFacts: extractKillFacts(filePath),
    ratingFacts: extractRatingFacts(filePath),
  }
}

export function extractKillFacts(filePath: string): DemoKillFact[] {
  // X/Y are required for the parser to populate position fields; bare
  // team_name expands to attacker_team_name and user_team_name.
  const raw = parseEvent(filePath, "player_death", [
    "X",
    "Y",
    "attacker_X",
    "attacker_Y",
    "attacker_steamid",
    "user_X",
    "user_Y",
    "user_steamid",
    "team_name",
    "total_rounds_played",
  ]) as unknown[]
  return normalizeKillFacts(z.array(killRowSchema).parse(raw))
}

export function normalizeKillFacts(kills: KillRow[]): DemoKillFact[] {
  return kills.map((kill) => ({
    round: kill.total_rounds_played ?? 0,
    tick: kill.tick,
    attackerSteamid64: kill.attacker_steamid ?? null,
    attackerX: kill.attacker_X ?? null,
    attackerY: kill.attacker_Y ?? null,
    attackerSide: toSide(kill.attacker_team_name),
    victimSteamid64: kill.user_steamid ?? null,
    victimX: kill.user_X ?? null,
    victimY: kill.user_Y ?? null,
    victimSide: toSide(kill.user_team_name),
    weapon: kill.weapon ?? null,
    headshot: kill.headshot ?? null,
  }))
}

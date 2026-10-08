import { parseEvents, parseTicks } from "@laihoe/demoparser2"
import { z } from "zod"

export type RatingSide = 2 | 3

export const ratingEventSchema = z.object({
  event_name: z.string(),
  tick: z.number().int().nonnegative(),
  game_time: z.number().finite().nullish(),
  total_rounds_played: z.number().int().nullish(),
  is_warmup_period: z.boolean().nullish(),
  game_phase: z.number().nullish(),
  winner: z.string().nullish(),
  attacker_steamid: z.string().nullish(),
  attacker_team_num: z.number().nullish(),
  user_steamid: z.string().nullish(),
  user_team_num: z.number().nullish(),
  user_health: z.number().nullish(),
  assister_steamid: z.string().nullish(),
  assister_team_num: z.number().nullish(),
  assistedflash: z.boolean().nullish(),
  headshot: z.boolean().nullish(),
  dmg_health: z.number().nonnegative().nullish(),
  health: z.number().nonnegative().nullish(),
  weapon: z.string().nullish(),
})

export const ratingSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  player_steamid: z.string().nullish(),
  player_name: z.string().nullish(),
  team_num: z.number().nullish(),
  is_alive: z.boolean().nullish(),
  health: z.number().nullish(),
  round_start_equip_value: z.number().nullish(),
})

export type RatingEvent = z.infer<typeof ratingEventSchema>
export type RatingSnapshot = z.infer<typeof ratingSnapshotSchema>
export type RatingRound = {
  ordinal: number
  rawRound: number
  startTick: number
  freezeTick: number
  endTick: number
  winner: RatingSide
}
export type PlayerRoundFact = {
  ordinal: number
  steamid64: string
  name: string
  side: RatingSide
  kills: number
  deaths: number
  assists: number
  flashAssists: number
  headshotKills: number
  damage: number
  utilityDamage: number
  survived: boolean
  traded: boolean
  openingKills: number
  openingDeaths: number
  clutchWins: number
  clutchOpponents: number
  equipmentValue: number | null
}
export type RatingExtraction = {
  rounds: RatingRound[]
  facts: PlayerRoundFact[]
  unavailableReason: string | null
}

export const TRADE_SECONDS = 3

function isPlayer(id: string | null | undefined): id is string {
  return !!id && /^\d{17}$/.test(id) && id !== "00000000000000000"
}

function failed(reason: string): RatingExtraction {
  return { rounds: [], facts: [], unavailableReason: reason }
}

export function deriveRatingFacts(
  events: RatingEvent[],
  snapshots: RatingSnapshot[]
): RatingExtraction {
  const ordered = events
    .map((event, order) => ({ ...event, order }))
    .sort((a, b) => a.tick - b.tick || a.order - b.order)
  const begins = ordered.filter((e) => e.event_name === "begin_new_match")
  const matchStart = begins.at(-1)?.tick ?? 0
  const ends = ordered.filter(
    (e) =>
      e.tick >= matchStart &&
      e.event_name === "round_end" &&
      e.is_warmup_period === false &&
      (e.winner === "CT" || e.winner === "T")
  )
  if (!ends.length || ends.at(-1)?.game_phase !== 5) {
    return failed("Incomplete competitive game")
  }
  if (new Set(ends.map((e) => e.tick)).size !== ends.length) {
    return failed("Duplicate competitive round outcomes")
  }

  const rounds: RatingRound[] = []
  for (const [ordinal, end] of ends.entries()) {
    const lower = ordinal === 0 ? matchStart : ends[ordinal - 1].tick
    const starts = ordered.filter(
      (e) =>
        e.event_name === "round_start" &&
        e.tick >= lower &&
        e.tick < end.tick &&
        e.is_warmup_period === false &&
        e.total_rounds_played === ordinal
    )
    const start = starts[0]
    const freezes = ordered.filter(
      (e) =>
        e.event_name === "round_freeze_end" &&
        e.tick >= (start?.tick ?? end.tick) &&
        e.tick < end.tick &&
        e.is_warmup_period === false &&
        e.total_rounds_played === ordinal
    )
    const freeze = freezes[0]
    if (
      starts.length !== 1 ||
      freezes.length !== 1 ||
      !start ||
      !freeze ||
      end.total_rounds_played !== ordinal + 1
    ) {
      return failed("Missing or restarted competitive round boundaries")
    }
    rounds.push({
      ordinal,
      rawRound: ordinal,
      startTick: start.tick,
      freezeTick: freeze.tick,
      endTick: end.tick,
      winner: end.winner === "CT" ? 3 : 2,
    })
  }
  if (rounds.length < 13) return failed("Incomplete competitive game")

  const byTick = new Map<number, RatingSnapshot[]>()
  for (const row of snapshots) {
    const bucket = byTick.get(row.tick) ?? []
    bucket.push(row)
    byTick.set(row.tick, bucket)
  }
  const facts: PlayerRoundFact[] = []
  for (const round of rounds) {
    const players = new Map<string, PlayerRoundFact>()
    const alive = new Set<string>()
    const health = new Map<string, number>()
    for (const row of byTick.get(round.freezeTick) ?? []) {
      if (row.team_num !== 2 && row.team_num !== 3) continue
      if (row.is_alive !== true) continue
      if (!isPlayer(row.player_steamid) || !row.player_name) {
        return failed("Unattributable or bot round participant")
      }
      if (row.health == null || row.health <= 0) {
        return failed("Missing round-start participant health")
      }
      if (players.has(row.player_steamid))
        return failed("Duplicate participant snapshot")
      players.set(row.player_steamid, {
        ordinal: round.ordinal,
        steamid64: row.player_steamid,
        name: row.player_name,
        side: row.team_num,
        kills: 0,
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
        equipmentValue: row.round_start_equip_value ?? null,
      })
      alive.add(row.player_steamid)
      health.set(row.player_steamid, row.health)
    }
    if (
      ![2, 3].every((side) =>
        [...players.values()].some((p) => p.side === side)
      )
    ) {
      return failed("Missing round participation snapshots")
    }
    const terminal = new Map(
      (byTick.get(round.endTick) ?? [])
        .filter((p) => isPlayer(p.player_steamid))
        .map((p) => [p.player_steamid, p])
    )
    const deaths: { killer: string; victim: PlayerRoundFact; time: number }[] =
      []
    const clutch = new Map<string, number>()
    let opened = false
    const roundEvents = ordered.filter(
      (e) =>
        e.tick >= round.freezeTick &&
        e.tick <= round.endTick &&
        (e.event_name === "player_death" || e.event_name === "player_hurt") &&
        e.is_warmup_period === false
    )
    for (const event of roundEvents) {
      if (
        event.total_rounds_played != null &&
        event.total_rounds_played !== round.rawRound
      ) {
        return failed("Event outside its competitive round")
      }
    }
    for (const event of roundEvents) {
      const victim = event.user_steamid
        ? players.get(event.user_steamid)
        : undefined
      const attacker = event.attacker_steamid
        ? players.get(event.attacker_steamid)
        : undefined
      if (!victim) return failed("Missing participant identity during a round")
      if (
        event.user_team_num !== victim.side ||
        (attacker && event.attacker_team_num !== attacker.side)
      ) {
        return failed("Unreliable event-side attribution")
      }
      const enemy = attacker && attacker.side !== victim.side
      if (
        event.attacker_steamid &&
        !attacker &&
        isPlayer(event.attacker_steamid)
      ) {
        return failed("Mid-round participant has no start snapshot")
      }
      if (event.event_name === "player_hurt") {
        if (event.dmg_health == null || event.health == null) {
          return failed("Missing damage health transition")
        }
        const before = health.get(victim.steamid64)!
        health.set(victim.steamid64, event.health)
        if (enemy) {
          // Tick snapshots can lag multiple hits in one tick; use ordered hurt transitions.
          const damage = Math.min(event.dmg_health, before)
          attacker.damage += damage
          if (
            ["hegrenade", "inferno", "molotov", "incgrenade"].includes(
              event.weapon ?? ""
            )
          ) {
            attacker.utilityDamage += damage
          }
        }
        continue
      }
      if (!alive.has(victim.steamid64))
        return failed("Repeated death or unreliable alive state")
      const attackerAlive = attacker ? alive.has(attacker.steamid64) : false
      victim.deaths++
      alive.delete(victim.steamid64)
      if (enemy) {
        if (event.game_time == null || event.assistedflash == null) {
          return failed("Missing trade-time or assist metadata")
        }
        attacker.kills++
        if (event.headshot) attacker.headshotKills++
        if (!opened) {
          attacker.openingKills = 1
          victim.openingDeaths = 1
          opened = true
        }
        const assister = event.assister_steamid
          ? players.get(event.assister_steamid)
          : undefined
        if (
          event.assister_steamid &&
          !assister &&
          isPlayer(event.assister_steamid)
        ) {
          return failed("Missing assister participation")
        }
        if (assister) {
          if (event.assister_team_num !== assister.side) {
            return failed("Unreliable assist attribution")
          }
          // CS2 can credit friendly damage as an assist; it earns no SFL support.
          if (
            assister.side === attacker.side &&
            assister.steamid64 !== attacker.steamid64
          ) {
            if (event.assistedflash) assister.flashAssists++
            else assister.assists++
          }
        }
        if (attackerAlive) {
          for (const death of deaths) {
            const elapsed = event.game_time - death.time
            if (
              death.killer === victim.steamid64 &&
              death.victim.side === attacker.side &&
              elapsed >= 0 &&
              elapsed <= TRADE_SECONDS
            )
              death.victim.traded = true
          }
        }
        deaths.push({
          killer: attacker.steamid64,
          victim,
          time: event.game_time,
        })
      }
      for (const side of [2, 3]) {
        const remaining = [...alive].filter(
          (id) => players.get(id)?.side === side
        )
        const opponents = [...alive].filter(
          (id) => players.get(id)?.side !== side
        ).length
        if (
          remaining.length === 1 &&
          opponents > 0 &&
          !clutch.has(remaining[0])
        ) {
          clutch.set(remaining[0], opponents)
        }
      }
    }
    for (const player of players.values()) {
      const end = terminal.get(player.steamid64)
      if (
        !end ||
        end.is_alive == null ||
        end.team_num !== player.side ||
        (player.deaths === 0 && end.is_alive === false)
      ) {
        return failed("Missing or inconsistent round-end survival snapshot")
      }
      player.survived = player.deaths === 0 && end.is_alive
      const opponents = clutch.get(player.steamid64)
      if (opponents && player.side === round.winner) {
        player.clutchWins = 1
        player.clutchOpponents = opponents
      }
      facts.push(player)
    }
  }
  return { rounds, facts, unavailableReason: null }
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
          (e) =>
            e.event_name === "round_freeze_end" || e.event_name === "round_end"
        )
        .map((e) => e.tick)
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

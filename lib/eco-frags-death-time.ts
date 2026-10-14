import { ECO_EQUIPMENT, type RatingEvent, type RatingSide } from "./demo-rating"

// Victim loadout ceiling for an eco frag. Separate from ECO_EQUIPMENT (v1 team
// rule). current_equip_value already includes armor, so this is a loadout
// threshold, not an armor adjustment.
export const VICTIM_ECO_EQUIPMENT = 2000

// Draft of a death-time eco-frag read: team equipment is taken from the tick
// of each death rather than round-start, so pickups/drops before a death count.
// Not part of RATING_VERSION "sfl-v2" yet; see docs/adr/ before wiring it in.

export type DeathTimeSnapshot = {
  tick: number
  player_steamid: string | null
  player_name: string | null
  team_num: number | null
  is_alive: boolean | null
  current_equip_value: number | null
  inventory: string[] | null
  active_weapon_name: string | null
}

export type EcoFragDraft = {
  round: number
  tick: number
  killerSteamid64: string
  killerName: string
  killerSide: RatingSide
  killerTeamEquip: number | null
  victimName: string
  victimSide: RatingSide
  victimEquip: number | null
  victimInventory: string[]
  victimActiveWeapon: string | null
  weapon: string | null
}

type RoundWindow = {
  ordinal: number
  freezeTick: number
  endTick: number
  roster: Set<string>
}

// Average over players still alive at this tick; dead players keep their last
// equipment value, so they would otherwise skew the team's current buy.
function livingTeamAverage(
  snapshots: DeathTimeSnapshot[],
  roster: Set<string>,
  side: RatingSide,
  tick: number
): number | null {
  const values = snapshots
    .filter(
      (s) =>
        s.tick === tick &&
        s.team_num === side &&
        s.is_alive === true &&
        s.player_steamid != null &&
        roster.has(s.player_steamid)
    )
    .map((s) => s.current_equip_value)
  if (!values.length) return null
  let total = 0
  for (const v of values) {
    if (v == null) return null
    total += v
  }
  return total / values.length
}

// Builds competitive round windows from freeze-end and round-end events,
// keeping only rounds that started after the last begin_new_match.
export function buildRoundWindows(
  events: RatingEvent[],
  snapshots: DeathTimeSnapshot[]
): RoundWindow[] {
  const ordered = [...events].sort((a, b) => a.tick - b.tick)
  const matchStart =
    ordered.filter((e) => e.event_name === "begin_new_match").at(-1)?.tick ?? 0
  const freezes = ordered.filter(
    (e) =>
      e.event_name === "round_freeze_end" &&
      e.tick >= matchStart &&
      e.is_warmup_period === false
  )
  const ends = ordered.filter(
    (e) => e.event_name === "round_end" && e.is_warmup_period === false
  )
  return freezes.flatMap((freeze, ordinal) => {
    const end = ends.find((e) => e.tick > freeze.tick)
    if (!end) return []
    const roster = new Set(
      snapshots
        .filter(
          (s) =>
            s.tick === freeze.tick &&
            (s.team_num === 2 || s.team_num === 3) &&
            s.is_alive === true &&
            s.player_steamid != null
        )
        .map((s) => s.player_steamid!)
    )
    return [{ ordinal, freezeTick: freeze.tick, endTick: end.tick, roster }]
  })
}

export function deriveEcoFragsAtDeath(
  events: RatingEvent[],
  snapshots: DeathTimeSnapshot[]
): EcoFragDraft[] {
  const rounds = buildRoundWindows(events, snapshots)
  const frags: EcoFragDraft[] = []
  for (const death of events) {
    if (death.event_name !== "player_death") continue
    const round = rounds.find(
      (r) => death.tick >= r.freezeTick && death.tick <= r.endTick
    )
    if (!round) continue
    const killer = death.attacker_steamid
    const victim = death.user_steamid
    if (!killer || !victim || killer === victim) continue
    const killerSide = death.attacker_team_num
    const victimSide = death.user_team_num
    if (
      (killerSide !== 2 && killerSide !== 3) ||
      (victimSide !== 2 && victimSide !== 3) ||
      killerSide === victimSide
    )
      continue
    // At the death tick the victim is already dead and their inventory is
    // empty, so their loadout comes from the last tick they were alive.
    const victimSnap = snapshots
      .filter(
        (s) =>
          s.player_steamid === victim &&
          s.is_alive === true &&
          s.tick < death.tick
      )
      .sort((a, b) => b.tick - a.tick)[0]
    // Eco is the victim's own loadout: at or below VICTIM_ECO_EQUIPMENT.
    // The killer's team must be non-eco, using its living players' average.
    const victimEquip = victimSnap?.current_equip_value ?? null
    const killerTeamEquip = livingTeamAverage(
      snapshots,
      round.roster,
      killerSide,
      death.tick
    )
    if (
      victimEquip == null ||
      victimEquip > VICTIM_ECO_EQUIPMENT ||
      killerTeamEquip == null ||
      killerTeamEquip <= ECO_EQUIPMENT
    )
      continue
    const killerSnap = snapshots.find(
      (s) => s.tick === death.tick && s.player_steamid === killer
    )
    frags.push({
      round: round.ordinal + 1,
      tick: death.tick,
      killerSteamid64: killer,
      killerName: killerSnap?.player_name ?? killer,
      killerSide,
      killerTeamEquip,
      victimName: victimSnap?.player_name ?? victim,
      victimSide,
      victimEquip,
      victimInventory: victimSnap?.inventory ?? [],
      victimActiveWeapon: victimSnap?.active_weapon_name ?? null,
      weapon: death.weapon ?? null,
    })
  }
  return frags
}

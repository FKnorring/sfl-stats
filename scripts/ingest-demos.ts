import fs from "node:fs"
import path from "node:path"
import { sql } from "drizzle-orm"

import { openWritableDb, type AppDb } from "@/lib/db/client"
import {
  STAT_FIELDS,
  tickRowSchema,
  deriveStats,
  roundEndRowSchema,
  killRowSchema,
  isMatchComplete,
  type RoundEndRow,
} from "@/lib/demo-stats"
import { resolvePlayerMatch, type MatchCandidate } from "@/lib/matching"
import {
  deriveStableTeamSides,
  findClosestToornamentMatch,
  type KillSideRow,
} from "@/lib/team-anchoring"
import { z } from "zod"
import { parseHeader, parseEvent, parseTicks } from "@laihoe/demoparser2"

const DEFAULT_DIR = path.join(process.cwd(), "demos")
const OVERRIDES_PATH = path.join(process.cwd(), "data", "player-overrides.json")
const DEFAULT_TOORNAMENT_WINDOW_HOURS = 24

function parseArgs(argv: string[]): {
  dir: string
  toornamentWindowHours: number
} {
  const idx = argv.indexOf("--dir")
  const dir =
    idx !== -1 ? argv[idx + 1] : (process.env.DEMOS_DIR ?? DEFAULT_DIR)
  if (!dir) throw new Error("--dir requires a value")

  const windowIdx = argv.indexOf("--toornament-window-hours")
  const toornamentWindowHours =
    windowIdx !== -1
      ? Number(argv[windowIdx + 1])
      : DEFAULT_TOORNAMENT_WINDOW_HOURS
  if (!Number.isFinite(toornamentWindowHours) || toornamentWindowHours <= 0) {
    throw new Error("--toornament-window-hours requires a positive number")
  }

  return { dir, toornamentWindowHours }
}

// Demo filenames embed a "YYYY-MM-DD_HH-MM-SS" timestamp prefix (the actual
// play date), e.g. "2026-10-01_19-02-45_19_de_dust2_...dem" — see the comment
// on matches.fileName in lib/db/schema.ts. Parsing this (instead of using
// ingestion wall-clock time) is a prerequisite for the Toornament date
// fallback below, which compares demoDate against the schedule.
const DEMO_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/

function parseDemoTimestamp(fileName: string): string | null {
  const m = DEMO_TIMESTAMP_RE.exec(fileName)
  if (!m) return null
  const [, date, hh, mm, ss] = m
  const iso = `${date}T${hh}:${mm}:${ss}`
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function walkDemosFolder(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    // Resolve symlinks (common for demo folders synced/linked from elsewhere)
    // rather than relying on Dirent's own type, which reports symlinks as
    // neither a file nor a directory.
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      out.push(...walkDemosFolder(full))
    } else if (stat.isFile() && entry.name.toLowerCase().endsWith(".dem")) {
      out.push(full)
    }
  }
  return out
}

const overridesFileSchema = z.record(
  z.string(), // steamid64
  z.object({
    rosterEntryId: z.number(),
    note: z.string().optional(),
  })
)

function loadOverrides(): Map<
  string,
  { rosterEntryId: number; note?: string }
> {
  if (!fs.existsSync(OVERRIDES_PATH)) return new Map()
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"))
  const parsed = overridesFileSchema.parse(raw)
  return new Map(Object.entries(parsed))
}

async function applyOverrides(
  db: AppDb,
  overrides: Map<string, { rosterEntryId: number; note?: string }>
) {
  const now = new Date().toISOString()
  for (const [steamid64, { rosterEntryId, note }] of overrides) {
    await db.run(sql`
      INSERT INTO player_name_overrides (steamid64, roster_entry_id, note, created_at)
      VALUES (${steamid64}, ${rosterEntryId}, ${note ?? null}, ${now})
      ON CONFLICT(steamid64) DO UPDATE SET
        roster_entry_id = excluded.roster_entry_id,
        note = excluded.note
    `)
    await db.run(sql`
      UPDATE roster_entries
      SET matched_steamid64 = ${steamid64}, match_confidence = 1, match_status = 'manual'
      WHERE id = ${rosterEntryId}
    `)
  }
}

type RosterRow = {
  id: number
  nickname: string
  matched_steamid64: string | null
  match_status: string
}

// Only the newest season's rosters take part in matching, so a demo player
// is never matched to an entry from a season they played in long ago.
const CURRENT_SEASON_SQL = sql`team_id IN (
  SELECT id FROM teams WHERE season = (
    SELECT season FROM teams
    ORDER BY CAST(TRIM(REPLACE(season, 'SFL Säsong', '')) AS INTEGER) DESC
    LIMIT 1
  )
)`

async function getUnresolvedCandidates(db: AppDb): Promise<MatchCandidate[]> {
  // Candidates still open for (re-)matching: never matched, or matched only
  // at low confidence. Manual and ambiguous entries are left alone —
  // manual always wins via the override table, and ambiguous needs a human.
  const rows = (await db.all(
    sql`SELECT id, nickname, matched_steamid64, match_status FROM roster_entries
        WHERE match_status IN ('unmatched', 'auto_low', 'auto_high')
          AND ${CURRENT_SEASON_SQL}`
  )) as RosterRow[]
  return rows.map((r) => ({ rosterEntryId: r.id, nickname: r.nickname }))
}

/**
 * Same as getUnresolvedCandidates, but narrowed to a single team's still-open
 * roster entries — used by the team-side anchoring pass, which only ever
 * narrows resolvePlayerMatch's candidate pool, never force-assigns by
 * elimination.
 */
async function getUnresolvedCandidatesForTeam(
  db: AppDb,
  teamId: number
): Promise<MatchCandidate[]> {
  const rows = (await db.all(
    sql`SELECT id, nickname, matched_steamid64, match_status FROM roster_entries
        WHERE team_id = ${teamId}
          AND match_status IN ('unmatched', 'auto_low', 'auto_high')
          AND ${CURRENT_SEASON_SQL}`
  )) as RosterRow[]
  return rows.map((r) => ({ rosterEntryId: r.id, nickname: r.nickname }))
}

async function upsertPlayer(
  db: AppDb,
  steamid64: string,
  inGameName: string,
  now: string
) {
  await db.run(sql`
    INSERT INTO players (steamid64, latest_ingame_name, first_seen_at, last_seen_at)
    VALUES (${steamid64}, ${inGameName}, ${now}, ${now})
    ON CONFLICT(steamid64) DO UPDATE SET
      latest_ingame_name = excluded.latest_ingame_name,
      last_seen_at = excluded.last_seen_at
  `)
}

async function updateRosterMatch(
  db: AppDb,
  rosterEntryId: number,
  steamid64: string,
  confidence: number | null,
  status: string
) {
  await db.run(sql`
    UPDATE roster_entries
    SET matched_steamid64 = ${steamid64}, match_confidence = ${confidence}, match_status = ${status}
    WHERE id = ${rosterEntryId}
  `)
}

type Summary = {
  manual: number
  autoHigh: number
  autoLow: number
  ambiguous: number
  unmatched: number
}

const sideTickSchema = z.object({
  tick: z.number(),
  player_steamid: z.string().nullish(),
  team_name: z.string().nullish(),
})

/**
 * Normalizes CS2 side labels to a single letter. round_end's `winner` field
 * uses "CT"/"T" (confirmed by probing a real demo), while parseTicks'
 * `team_name` prop uses "CT"/"TERRORIST" — different vocabularies for the
 * same two sides ("CT"->"C", "T"->"T", "TERRORIST"->"T"), so round-winner
 * and player-side lookups don't compare equal unless both are normalized
 * to their first letter first.
 */
function normalizeSide(side: string): string {
  return side[0]
}

type PartialTeamScore = {
  teamAId: number | null
  teamAScore: number | null
  teamBId: number | null
  teamBScore: number | null
}

/**
 * Tallies a round score between distinct roster teams found among this
 * demo's matched players, by majority-voting each team's CT/TERRORIST side
 * at every round's end tick (sides swap at halftime, so this has to be
 * looked up per round, not once at the end of the demo) and crediting
 * whichever team held the round_end event's winning side.
 *
 * Returns both sides null if fewer than one distinct team resolved at all,
 * one side filled with the other left null if exactly one team resolved
 * (the Toornament fallback in ingestDemo() handles the other side from
 * here), or both filled if exactly two distinct teams resolved. More than
 * two distinct teams (a demo with players from several unrelated rosters —
 * shouldn't normally happen) is treated the same as "can't resolve either
 * side cleanly" and returns both null, same as before.
 */
function computeTeamScore(
  filePath: string,
  rounds: RoundEndRow[],
  steamidToTeam: Map<string, number>
): PartialTeamScore {
  const unresolved: PartialTeamScore = {
    teamAId: null,
    teamAScore: null,
    teamBId: null,
    teamBScore: null,
  }

  const teamIds = [...new Set(steamidToTeam.values())]
  if (teamIds.length === 0 || teamIds.length > 2) return unresolved
  const [teamAId, teamBId] = teamIds

  const decidedRounds = rounds.filter((r) => r.winner)
  if (decidedRounds.length === 0) return unresolved

  if (teamBId == null) {
    // Only one distinct team resolved among matched players — no round
    // score to tally against an unknown opponent, but the resolved side's
    // identity is still useful to the caller.
    return { teamAId, teamAScore: null, teamBId: null, teamBScore: null }
  }

  const rawTicks = parseTicks(
    filePath,
    ["player_steamid", "team_name"],
    decidedRounds.map((r) => r.tick)
  ) as unknown[]
  const sideTicks = z.array(sideTickSchema).parse(rawTicks)

  const bySideTick = new Map<number, { steamid64: string; side: string }[]>()
  for (const row of sideTicks) {
    if (!row.player_steamid || !row.team_name) continue
    if (!bySideTick.has(row.tick)) bySideTick.set(row.tick, [])
    bySideTick.get(row.tick)!.push({
      steamid64: row.player_steamid,
      side: normalizeSide(row.team_name),
    })
  }

  let teamAScore = 0
  let teamBScore = 0

  for (const round of decidedRounds) {
    const players = bySideTick.get(round.tick) ?? []
    const sideCounts = new Map<number, Record<string, number>>([
      [teamAId, {}],
      [teamBId, {}],
    ])
    for (const { steamid64, side } of players) {
      const teamId = steamidToTeam.get(steamid64)
      if (teamId == null) continue
      const counts = sideCounts.get(teamId)!
      counts[side] = (counts[side] ?? 0) + 1
    }

    const sideOf = (teamId: number): string | null => {
      const counts = sideCounts.get(teamId)!
      const entries = Object.entries(counts)
      if (entries.length === 0) return null
      return entries.sort((a, b) => b[1] - a[1])[0][0]
    }

    const winnerSide = round.winner ? normalizeSide(round.winner) : null
    const teamASide = sideOf(teamAId)
    const teamBSide = sideOf(teamBId)
    if (teamASide && teamASide === winnerSide) teamAScore++
    else if (teamBSide && teamBSide === winnerSide) teamBScore++
    // Neither side resolvable for this round (no matched players alive/
    // present at that tick) — round isn't attributed to either team.
  }

  return { teamAId, teamAScore, teamBId, teamBScore }
}

// parseTicks/events label sides "CT"/"TERRORIST"; store "CT"/"T".
function toSide(name: string | null | undefined): string | null {
  if (name === "CT") return "CT"
  if (name === "TERRORIST") return "T"
  return null
}

/** Inserts match_kills rows and returns them in the shape team-anchoring's
 * deriveStableTeamSides/computeTeamScoreFromKills consume, so callers that
 * already have them in memory (ingestDemo) don't need a round-trip through
 * the DB — see getKillSideRows for the backfill path, which does. */
async function insertKills(
  db: AppDb,
  matchId: number,
  filePath: string
): Promise<KillSideRow[]> {
  // "X"/"Y" must be requested for demoparser2 to populate the attacker_*/
  // user_* position fields at all; without them they come back undefined.
  const raw = parseEvent(filePath, "player_death", [
    "X",
    "Y",
    "attacker_X",
    "attacker_Y",
    "attacker_steamid",
    "user_X",
    "user_Y",
    "user_steamid",
    // Bare prop name; demoparser2 expands it to attacker_/user_team_name.
    "team_name",
    "total_rounds_played",
  ]) as unknown[]
  const kills = z.array(killRowSchema).parse(raw)

  const killSideRows: KillSideRow[] = []
  for (const k of kills) {
    if (!k.user_steamid) continue
    const attackerSide = toSide(k.attacker_team_name)
    const victimSide = toSide(k.user_team_name)
    const round = k.total_rounds_played ?? 0
    await db.run(sql`
      INSERT INTO match_kills (
        match_id, round, tick, attacker_steamid64, attacker_x, attacker_y, attacker_side,
        victim_steamid64, victim_x, victim_y, victim_side, weapon, headshot
      ) VALUES (
        ${matchId}, ${round}, ${k.tick}, ${k.attacker_steamid ?? null}, ${k.attacker_X ?? null}, ${k.attacker_Y ?? null}, ${attackerSide},
        ${k.user_steamid}, ${k.user_X ?? null}, ${k.user_Y ?? null}, ${victimSide}, ${k.weapon ?? null}, ${k.headshot == null ? null : k.headshot ? 1 : 0}
      )
    `)
    killSideRows.push({
      round,
      attackerSteamid64: k.attacker_steamid ?? null,
      attackerSide: attackerSide as "CT" | "T" | null,
      victimSteamid64: k.user_steamid,
      victimSide: victimSide as "CT" | "T" | null,
    })
  }
  return killSideRows
}

/** Backfill path: reloads already-inserted match_kills for a match, in the
 * same shape insertKills returns, without re-parsing the demo. */
async function getKillSideRows(
  db: AppDb,
  matchId: number
): Promise<KillSideRow[]> {
  const rows = (await db.all(
    sql`SELECT round, attacker_steamid64, attacker_side, victim_steamid64, victim_side
        FROM match_kills WHERE match_id = ${matchId}`
  )) as {
    round: number
    attacker_steamid64: string | null
    attacker_side: string | null
    victim_steamid64: string
    victim_side: string | null
  }[]
  return rows.map((r) => ({
    round: r.round,
    attackerSteamid64: r.attacker_steamid64,
    attackerSide: r.attacker_side as "CT" | "T" | null,
    victimSteamid64: r.victim_steamid64,
    victimSide: r.victim_side as "CT" | "T" | null,
  }))
}

type TeamResolution = "player_match" | "toornament_inferred" | null

type ResolvedTeams = {
  teamAId: number | null
  teamAScore: number | null
  teamBId: number | null
  teamBScore: number | null
  teamAResolution: TeamResolution
  teamBResolution: TeamResolution
  teamResolutionConflict: string | null
}

/** This team's completed Toornament matches, as {opponentTeamId, scheduledAt,
 * toornamentMatchId} from whichever side `teamId` played. */
async function getCompletedToornamentMatchesForTeam(
  db: AppDb,
  teamId: number
): Promise<
  { toornamentMatchId: number; scheduledAt: string; opponentTeamId: number }[]
> {
  const rows = (await db.all(
    sql`SELECT id, scheduled_at, team_a_id, team_b_id FROM toornament_matches
        WHERE status = 'completed' AND scheduled_at IS NOT NULL
          AND (team_a_id = ${teamId} OR team_b_id = ${teamId})`
  )) as {
    id: number
    scheduled_at: string
    team_a_id: number | null
    team_b_id: number | null
  }[]
  return rows
    .map((r) => ({
      toornamentMatchId: r.id,
      scheduledAt: r.scheduled_at,
      opponentTeamId: r.team_a_id === teamId ? r.team_b_id : r.team_a_id,
    }))
    .filter(
      (
        r
      ): r is {
        toornamentMatchId: number
        scheduledAt: string
        opponentTeamId: number
      } => r.opponentTeamId != null
    )
}

/**
 * Step 3+4 of the plan: given a demo's already-matched steamid->team facts
 * and its kill events, runs the team-side anchoring pass (narrowing
 * resolvePlayerMatch's candidate pool for teammates sharing a confirmed
 * anchor's stable side) and, for whichever side is still unresolved after
 * that, the Toornament date fallback. Mutates `candidates`/`steamidToTeam`/
 * `summary` in place as it upgrades roster matches, same convention as the
 * main per-tick loop in ingestDemo. Returns the final resolved team facts to
 * persist on `matches`, including conflict detection against a prior run's
 * stored resolution (for backfill re-runs — player-matched evidence always
 * wins and is kept; a disagreement is only recorded, never silently
 * overridden).
 */
async function resolveMatchTeams(
  db: AppDb,
  filePath: string,
  roundEnds: RoundEndRow[],
  killRows: KillSideRow[],
  steamidToTeam: Map<string, number>,
  steamidToInGameName: Map<string, string>,
  candidatesByTeam: (teamId: number) => Promise<MatchCandidate[]>,
  overrides: Map<string, { rosterEntryId: number }>,
  summary: Summary,
  toleranceHours: number,
  demoDate: string,
  priorResolution: {
    teamAId: number | null
    teamAResolution: TeamResolution
    teamBId: number | null
    teamBResolution: TeamResolution
  } | null
): Promise<ResolvedTeams> {
  // Anchoring pass: a stable side (A/B) whose already-matched steamids
  // majority-point to one roster team is an anchor for every other steamid
  // observed on that same side but not yet matched to any team.
  const stableSides = deriveStableTeamSides(killRows)
  const sideBuckets = new Map<"A" | "B", string[]>([
    ["A", []],
    ["B", []],
  ])
  for (const [steamid64, side] of stableSides) {
    sideBuckets.get(side)!.push(steamid64)
  }

  for (const [, steamids] of sideBuckets) {
    const anchorCounts = new Map<number, number>()
    for (const steamid64 of steamids) {
      const teamId = steamidToTeam.get(steamid64)
      if (teamId == null) continue
      anchorCounts.set(teamId, (anchorCounts.get(teamId) ?? 0) + 1)
    }
    if (anchorCounts.size === 0) continue
    const anchorTeamId = [...anchorCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0][0]

    const unmatched = steamids.filter((s) => !steamidToTeam.has(s))
    if (unmatched.length === 0) continue

    let teamCandidates = await candidatesByTeam(anchorTeamId)
    for (const steamid64 of unmatched) {
      const inGameName = steamidToInGameName.get(steamid64)
      if (!inGameName) continue
      const override = overrides.get(steamid64) ?? null
      const result = resolvePlayerMatch(inGameName, teamCandidates, override)
      if (result.rosterEntryIds.length === 0) continue

      for (const rosterEntryId of result.rosterEntryIds) {
        await updateRosterMatch(
          db,
          rosterEntryId,
          steamid64,
          result.confidence,
          result.status
        )
      }
      const claimed = new Set(result.rosterEntryIds)
      teamCandidates = teamCandidates.filter(
        (c) => !claimed.has(c.rosterEntryId)
      )
      steamidToTeam.set(steamid64, anchorTeamId)
      if (result.status === "auto_high") summary.autoHigh++
      else if (result.status === "auto_low") summary.autoLow++
    }
  }

  const score = computeTeamScore(filePath, roundEnds, steamidToTeam)

  let teamAId = score.teamAId
  let teamBId = score.teamBId
  let teamAResolution: TeamResolution = teamAId != null ? "player_match" : null
  let teamBResolution: TeamResolution = teamBId != null ? "player_match" : null
  let teamResolutionConflict: string | null = null

  // Toornament fallback: only for a side still unresolved after player
  // matching (with anchoring) — never overrides a player-matched side.
  if (teamAId != null && teamBId == null) {
    const toornamentCandidates = await getCompletedToornamentMatchesForTeam(
      db,
      teamAId
    )
    const fallback = findClosestToornamentMatch(
      demoDate,
      toornamentCandidates,
      toleranceHours
    )
    if (fallback.status === "resolved") {
      teamBId = fallback.opponentTeamId
      teamBResolution = "toornament_inferred"
    } else {
      console.warn(
        `[ingest-demos] Toornament fallback for team ${teamAId} on ${demoDate}: ${fallback.status}`
      )
    }
  } else if (teamBId != null && teamAId == null) {
    const toornamentCandidates = await getCompletedToornamentMatchesForTeam(
      db,
      teamBId
    )
    const fallback = findClosestToornamentMatch(
      demoDate,
      toornamentCandidates,
      toleranceHours
    )
    if (fallback.status === "resolved") {
      teamAId = fallback.opponentTeamId
      teamAResolution = "toornament_inferred"
    } else {
      console.warn(
        `[ingest-demos] Toornament fallback for team ${teamBId} on ${demoDate}: ${fallback.status}`
      )
    }
  }

  // Conflict check (backfill re-runs only): a prior toornament_inferred
  // guess for a side that this run's fresh player-matching now resolves
  // differently gets flagged, not silently overwritten — player-matched
  // evidence always wins and is what gets kept below.
  if (priorResolution) {
    if (
      priorResolution.teamAResolution === "toornament_inferred" &&
      teamAResolution === "player_match" &&
      priorResolution.teamAId != null &&
      priorResolution.teamAId !== teamAId
    ) {
      teamResolutionConflict = `teamA: toornament_inferred=${priorResolution.teamAId} vs player_match=${teamAId}`
    }
    if (
      priorResolution.teamBResolution === "toornament_inferred" &&
      teamBResolution === "player_match" &&
      priorResolution.teamBId != null &&
      priorResolution.teamBId !== teamBId
    ) {
      const note = `teamB: toornament_inferred=${priorResolution.teamBId} vs player_match=${teamBId}`
      teamResolutionConflict = teamResolutionConflict
        ? `${teamResolutionConflict}; ${note}`
        : note
    }
  }

  return {
    teamAId,
    teamAScore: score.teamAScore,
    teamBId,
    teamBScore: score.teamBScore,
    teamAResolution,
    teamBResolution,
    teamResolutionConflict,
  }
}

async function ingestDemo(
  db: AppDb,
  filePath: string,
  overrides: Map<string, { rosterEntryId: number }>,
  summary: Summary,
  toornamentWindowHours: number
) {
  const now = new Date().toISOString()

  const header = parseHeader(filePath) as Record<string, string>
  const roundEndsRaw = parseEvent(filePath, "round_end") as unknown[]
  const roundEnds = z.array(roundEndRowSchema).parse(roundEndsRaw)
  if (roundEnds.length === 0) {
    console.warn(`[ingest-demos] no rounds found, skipping: ${filePath}`)
    return
  }
  if (!isMatchComplete(roundEnds)) {
    console.warn(
      `[ingest-demos] match never reached a final score (dead artifact), skipping: ${filePath}`
    )
    return
  }
  const gameEndTick = Math.max(...roundEnds.map((r) => r.tick))
  const totalRounds = roundEnds.length

  const rawTicks = parseTicks(
    filePath,
    [...STAT_FIELDS],
    [gameEndTick]
  ) as unknown[]
  const tickRows = z.array(tickRowSchema).parse(rawTicks)

  const fileName = path.basename(filePath)
  const demoDate = parseDemoTimestamp(fileName)
  if (!demoDate) {
    console.warn(
      `[ingest-demos] couldn't parse a timestamp from filename "${fileName}", falling back to ingestion time`
    )
  }
  const matchRows = (await db.all(
    sql`INSERT INTO matches (file_name, map_name, server_name, demo_date, total_rounds, parsed_at)
        VALUES (${fileName}, ${header.map_name ?? null}, ${header.server_name ?? null}, ${demoDate ?? now}, ${totalRounds}, ${now})
        RETURNING id`
  )) as { id: number }[]
  const matchId = matchRows[0].id

  let candidates = await getUnresolvedCandidates(db)
  const steamidToTeam = new Map<string, number>()
  const steamidToInGameName = new Map<string, string>()

  for (const row of tickRows) {
    const stats = deriveStats(row, totalRounds)
    if (!stats) {
      console.warn(
        `[ingest-demos] dropping player row with no steamid/name in ${path.basename(filePath)} (bot or upstream null-field bug)`
      )
      continue
    }

    await upsertPlayer(db, stats.steamid64, stats.inGameName, now)
    steamidToInGameName.set(stats.steamid64, stats.inGameName)
    await db.run(sql`
      INSERT INTO player_match_stats (
        match_id, steamid64, team_name, kills, deaths, assists, headshot_kills,
        damage_total, utility_damage_total, enemies_flashed_total, mvps,
        ace_rounds, rounds_3k, rounds_4k, equipment_value_total, adr, hs_pct
      ) VALUES (
        ${matchId}, ${stats.steamid64}, ${stats.teamName}, ${stats.kills}, ${stats.deaths}, ${stats.assists}, ${stats.headshotKills},
        ${stats.damageTotal}, ${stats.utilityDamageTotal}, ${stats.enemiesFlashedTotal}, ${stats.mvps},
        ${stats.aceRounds}, ${stats.rounds3k}, ${stats.rounds4k}, ${stats.equipmentValueTotal}, ${stats.adr}, ${stats.hsPct}
      )
    `)

    const override = overrides.get(stats.steamid64) ?? null
    const result = resolvePlayerMatch(stats.inGameName, candidates, override)

    if (result.status === "manual") {
      summary.manual++
    } else if (result.rosterEntryIds.length > 0) {
      for (const rosterEntryId of result.rosterEntryIds) {
        await updateRosterMatch(
          db,
          rosterEntryId,
          stats.steamid64,
          result.confidence,
          result.status
        )
      }
      // Remove the now-claimed roster entries from the pool so a later demo
      // row (or a different player in the same demo) can't also claim them.
      const claimed = new Set(result.rosterEntryIds)
      candidates = candidates.filter((c) => !claimed.has(c.rosterEntryId))
      if (result.status === "auto_high") summary.autoHigh++
      else summary.autoLow++
    } else if (result.status === "ambiguous") {
      summary.ambiguous++
    } else {
      summary.unmatched++
    }

    if (result.status === "manual" || result.rosterEntryIds.length > 0) {
      const rosterEntryId = result.rosterEntryIds[0]
      const teamRows = (await db.all(
        sql`SELECT team_id FROM roster_entries WHERE id = ${rosterEntryId}`
      )) as { team_id: number }[]
      const teamRow = teamRows[0]
      if (teamRow) steamidToTeam.set(stats.steamid64, teamRow.team_id)
    }
  }

  const killRows = await insertKills(db, matchId, filePath)

  const resolved = await resolveMatchTeams(
    db,
    filePath,
    roundEnds,
    killRows,
    steamidToTeam,
    steamidToInGameName,
    (teamId) => getUnresolvedCandidatesForTeam(db, teamId),
    overrides,
    summary,
    toornamentWindowHours,
    demoDate ?? now,
    null // first ingest of this file — no prior resolution to conflict-check against
  )

  await db.run(sql`
    UPDATE matches SET
      team_a_id = ${resolved.teamAId}, team_a_score = ${resolved.teamAScore},
      team_b_id = ${resolved.teamBId}, team_b_score = ${resolved.teamBScore},
      team_a_resolution = ${resolved.teamAResolution}, team_b_resolution = ${resolved.teamBResolution},
      team_resolution_conflict = ${resolved.teamResolutionConflict}
    WHERE id = ${matchId}
  `)
}

/**
 * Backfill path (plan step 4): re-runs the anchoring + Toornament-fallback
 * resolution for a match whose team identity isn't fully resolved yet (or
 * previously disagreed with a Toornament guess), using the demo's
 * already-stored match_kills and whatever roster_entries matches have
 * improved since — without re-parsing the demo or re-inserting stats/kills.
 */
async function reresolveTeams(
  db: AppDb,
  matchId: number,
  filePath: string,
  overrides: Map<string, { rosterEntryId: number }>,
  summary: Summary,
  toornamentWindowHours: number
) {
  const matchRows = (await db.all(
    sql`SELECT demo_date, team_a_id, team_a_resolution, team_b_id, team_b_resolution
        FROM matches WHERE id = ${matchId}`
  )) as {
    demo_date: string | null
    team_a_id: number | null
    team_a_resolution: TeamResolution
    team_b_id: number | null
    team_b_resolution: TeamResolution
  }[]
  const match = matchRows[0]
  if (!match) return

  const roundEndsRaw = parseEvent(filePath, "round_end") as unknown[]
  const roundEnds = z.array(roundEndRowSchema).parse(roundEndsRaw)

  const killRows = await getKillSideRows(db, matchId)

  const playerRows = (await db.all(
    sql`SELECT pms.steamid64 AS steamid64, p.latest_ingame_name AS inGameName,
               re.team_id AS teamId
        FROM player_match_stats pms
        JOIN players p ON p.steamid64 = pms.steamid64
        LEFT JOIN roster_entries re ON re.matched_steamid64 = pms.steamid64
        WHERE pms.match_id = ${matchId}`
  )) as { steamid64: string; inGameName: string; teamId: number | null }[]

  const steamidToTeam = new Map<string, number>()
  const steamidToInGameName = new Map<string, string>()
  for (const row of playerRows) {
    steamidToInGameName.set(row.steamid64, row.inGameName)
    if (row.teamId != null) steamidToTeam.set(row.steamid64, row.teamId)
  }

  const resolved = await resolveMatchTeams(
    db,
    filePath,
    roundEnds,
    killRows,
    steamidToTeam,
    steamidToInGameName,
    (teamId) => getUnresolvedCandidatesForTeam(db, teamId),
    overrides,
    summary,
    toornamentWindowHours,
    match.demo_date ?? new Date().toISOString(),
    {
      teamAId: match.team_a_id,
      teamAResolution: match.team_a_resolution,
      teamBId: match.team_b_id,
      teamBResolution: match.team_b_resolution,
    }
  )

  await db.run(sql`
    UPDATE matches SET
      team_a_id = ${resolved.teamAId}, team_a_score = ${resolved.teamAScore},
      team_b_id = ${resolved.teamBId}, team_b_score = ${resolved.teamBScore},
      team_a_resolution = ${resolved.teamAResolution}, team_b_resolution = ${resolved.teamBResolution},
      team_resolution_conflict = ${resolved.teamResolutionConflict}
    WHERE id = ${matchId}
  `)
  if (resolved.teamResolutionConflict) {
    console.warn(
      `[ingest-demos] team resolution conflict for match ${matchId}: ${resolved.teamResolutionConflict}`
    )
  }
}

async function main() {
  const { dir, toornamentWindowHours } = parseArgs(process.argv.slice(2))
  const files = walkDemosFolder(dir)
  console.log(`[ingest-demos] found ${files.length} .dem files under ${dir}`)

  const db = openWritableDb()
  const overrides = loadOverrides()
  console.log(`[ingest-demos] loaded ${overrides.size} manual overrides`)

  await applyOverrides(db, overrides)

  const alreadyIngested = new Set(
    (
      (await db.all(sql`SELECT file_name FROM matches`)) as {
        file_name: string
      }[]
    ).map((r) => r.file_name)
  )

  const summary: Summary = {
    manual: 0,
    autoHigh: 0,
    autoLow: 0,
    ambiguous: 0,
    unmatched: 0,
  }
  let ingested = 0
  let skipped = 0

  // Demos ingested before kill positions were stored get backfilled here.
  const withKills = new Set(
    (
      (await db.all(
        sql`SELECT DISTINCT m.file_name AS file_name FROM matches m JOIN match_kills k ON k.match_id = m.id`
      )) as { file_name: string }[]
    ).map((r) => r.file_name)
  )

  // Demos whose team identity isn't fully resolved yet (or whose stored
  // Toornament guess previously disagreed with player matching) get
  // reresolveTeams() re-run here, since roster_entries matches may have
  // improved since this demo was first ingested — see plan step 4.
  const needsTeamReresolution = new Set(
    (
      (await db.all(
        sql`SELECT file_name, id FROM matches
            WHERE team_a_id IS NULL OR team_b_id IS NULL OR team_resolution_conflict IS NOT NULL`
      )) as { file_name: string; id: number }[]
    ).map((r) => r.file_name)
  )
  let reresolved = 0

  for (const file of files) {
    const name = path.basename(file)
    if (alreadyIngested.has(name)) {
      if (!withKills.has(name)) {
        const rows = (await db.all(
          sql`SELECT id FROM matches WHERE file_name = ${name}`
        )) as { id: number }[]
        console.log(`[ingest-demos] backfilling kills for ${name}`)
        try {
          await insertKills(db, rows[0].id, file)
        } catch (err) {
          console.error(`[ingest-demos] failed to backfill ${file}:`, err)
        }
      }
      if (needsTeamReresolution.has(name)) {
        const rows = (await db.all(
          sql`SELECT id FROM matches WHERE file_name = ${name}`
        )) as { id: number }[]
        console.log(`[ingest-demos] re-resolving teams for ${name}`)
        try {
          await reresolveTeams(
            db,
            rows[0].id,
            file,
            overrides,
            summary,
            toornamentWindowHours
          )
          reresolved++
        } catch (err) {
          console.error(`[ingest-demos] failed to re-resolve ${file}:`, err)
        }
      }
      skipped++
      continue
    }
    console.log(`[ingest-demos] parsing ${path.basename(file)}`)
    try {
      await ingestDemo(db, file, overrides, summary, toornamentWindowHours)
      ingested++
    } catch (err) {
      console.error(`[ingest-demos] failed to parse ${file}:`, err)
    }
  }

  console.log(
    `[ingest-demos] done: ${ingested} parsed, ${skipped} already ingested, ${reresolved} re-resolved`
  )
  console.log(
    `[ingest-demos] player-match resolution — manual: ${summary.manual}, auto_high: ${summary.autoHigh}, auto_low (review): ${summary.autoLow}, ambiguous (review): ${summary.ambiguous}, unmatched (review): ${summary.unmatched}`
  )
  if (summary.autoLow + summary.ambiguous + summary.unmatched > 0) {
    console.log(
      `[ingest-demos] run \`sqlite3 data/sfl.db "select id, nickname, team_id from roster_entries where match_status != 'manual' and match_status != 'auto_high'"\` to review, then edit data/player-overrides.json and re-run.`
    )
  }

  const conflictRows = (await db.all(
    sql`SELECT COUNT(*) AS n FROM matches WHERE team_resolution_conflict IS NOT NULL`
  )) as { n: number }[]
  if (conflictRows[0]?.n > 0) {
    console.log(
      `[ingest-demos] ${conflictRows[0].n} match(es) have a team_resolution_conflict — run \`sqlite3 data/sfl.db "select id, file_name, team_resolution_conflict from matches where team_resolution_conflict is not null"\` to review.`
    )
  }
}

main().catch((err) => {
  console.error("[ingest-demos] failed:", err)
  process.exit(1)
})

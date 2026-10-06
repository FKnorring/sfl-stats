import fs from "node:fs"
import path from "node:path"
import { sql } from "drizzle-orm"

import { openWritableDb, type AppDb } from "@/lib/db/client"
import {
  STAT_FIELDS,
  tickRowSchema,
  deriveStats,
  roundEndRowSchema,
  isMatchComplete,
  type RoundEndRow,
} from "@/lib/demo-stats"
import { resolvePlayerMatch, type MatchCandidate } from "@/lib/matching"
import { z } from "zod"
import { parseHeader, parseEvent, parseTicks } from "@laihoe/demoparser2"

const DEFAULT_DIR = path.join(process.cwd(), "demos")
const OVERRIDES_PATH = path.join(process.cwd(), "data", "player-overrides.json")

function parseArgs(argv: string[]): { dir: string } {
  const idx = argv.indexOf("--dir")
  const dir =
    idx !== -1 ? argv[idx + 1] : (process.env.DEMOS_DIR ?? DEFAULT_DIR)
  if (!dir) throw new Error("--dir requires a value")
  return { dir }
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

async function getUnresolvedCandidates(db: AppDb): Promise<MatchCandidate[]> {
  // Candidates still open for (re-)matching: never matched, or matched only
  // at low confidence. Manual and ambiguous entries are left alone —
  // manual always wins via the override table, and ambiguous needs a human.
  const rows = (await db.all(
    sql`SELECT id, nickname, matched_steamid64, match_status FROM roster_entries
        WHERE match_status IN ('unmatched', 'auto_low', 'auto_high')`
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

/**
 * Tallies a round score between exactly two roster teams, by majority-voting
 * each team's CT/TERRORIST side at every round's end tick (sides swap at
 * halftime, so this has to be looked up per round, not once at the end of
 * the demo) and crediting whichever team held the round_end event's
 * winning side. Returns null if the demo's matched players don't resolve to
 * exactly two distinct teams (scrim against a non-roster opponent, or too
 * few matched players to trust) — matches.team_a/b stays unset in that case.
 */
function computeTeamScore(
  filePath: string,
  rounds: RoundEndRow[],
  steamidToTeam: Map<string, number>
): {
  teamAId: number
  teamAScore: number
  teamBId: number
  teamBScore: number
} | null {
  const teamIds = [...new Set(steamidToTeam.values())]
  if (teamIds.length !== 2) return null
  const [teamAId, teamBId] = teamIds

  const decidedRounds = rounds.filter((r) => r.winner)
  if (decidedRounds.length === 0) return null

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

async function ingestDemo(
  db: AppDb,
  filePath: string,
  overrides: Map<string, { rosterEntryId: number }>,
  summary: Summary
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
  const matchRows = (await db.all(
    sql`INSERT INTO matches (file_name, map_name, server_name, demo_date, total_rounds, parsed_at)
        VALUES (${fileName}, ${header.map_name ?? null}, ${header.server_name ?? null}, ${now}, ${totalRounds}, ${now})
        RETURNING id`
  )) as { id: number }[]
  const matchId = matchRows[0].id

  let candidates = await getUnresolvedCandidates(db)
  const steamidToTeam = new Map<string, number>()

  for (const row of tickRows) {
    const stats = deriveStats(row, totalRounds)
    if (!stats) {
      console.warn(
        `[ingest-demos] dropping player row with no steamid/name in ${path.basename(filePath)} (bot or upstream null-field bug)`
      )
      continue
    }

    await upsertPlayer(db, stats.steamid64, stats.inGameName, now)
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

  const score = computeTeamScore(filePath, roundEnds, steamidToTeam)
  if (score) {
    await db.run(sql`
      UPDATE matches SET team_a_id = ${score.teamAId}, team_a_score = ${score.teamAScore}, team_b_id = ${score.teamBId}, team_b_score = ${score.teamBScore} WHERE id = ${matchId}
    `)
  }
}

async function main() {
  const { dir } = parseArgs(process.argv.slice(2))
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

  for (const file of files) {
    if (alreadyIngested.has(path.basename(file))) {
      skipped++
      continue
    }
    console.log(`[ingest-demos] parsing ${path.basename(file)}`)
    try {
      await ingestDemo(db, file, overrides, summary)
      ingested++
    } catch (err) {
      console.error(`[ingest-demos] failed to parse ${file}:`, err)
    }
  }

  console.log(
    `[ingest-demos] done: ${ingested} parsed, ${skipped} already ingested`
  )
  console.log(
    `[ingest-demos] player-match resolution — manual: ${summary.manual}, auto_high: ${summary.autoHigh}, auto_low (review): ${summary.autoLow}, ambiguous (review): ${summary.ambiguous}, unmatched (review): ${summary.unmatched}`
  )
  if (summary.autoLow + summary.ambiguous + summary.unmatched > 0) {
    console.log(
      `[ingest-demos] run \`sqlite3 data/sfl.db "select id, nickname, team_id from roster_entries where match_status != 'manual' and match_status != 'auto_high'"\` to review, then edit data/player-overrides.json and re-run.`
    )
  }
}

main().catch((err) => {
  console.error("[ingest-demos] failed:", err)
  process.exit(1)
})

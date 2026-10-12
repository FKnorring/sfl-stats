import path from "node:path"
import { sql } from "drizzle-orm"
import type { AppDb } from "@/lib/db/client"
import {
  extractDemoFacts,
  extractKillFacts,
  extractRoundEnds,
  type DemoKillFact,
} from "@/scripts/demos/domain/demo-extraction"
import { persistRatingExtraction } from "@/lib/rating-db"
import type { KillSideRow } from "@/scripts/demos/domain/team-anchoring"
import {
  createDemoMatching,
  emptyMatchingSummary,
  type MatchingSummary,
  type PlayerOverrides,
} from "./player-matching"
import {
  resolveDemoTeams,
  type ReadSideTicks,
  type ResolvedTeams,
  type TeamResolution,
} from "./team-resolution"

type Extraction = {
  demo: typeof extractDemoFacts
  kills: typeof extractKillFacts
  rounds: typeof extractRoundEnds
  sides?: ReadSideTicks
}

const extraction: Extraction = {
  demo: extractDemoFacts,
  kills: extractKillFacts,
  rounds: extractRoundEnds,
}

const DEMO_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/

function parseDemoTimestamp(fileName: string): string | null {
  const match = DEMO_TIMESTAMP_RE.exec(fileName)
  if (!match) return null
  const [, date, hh, mm, ss] = match
  const parsed = new Date(`${date}T${hh}:${mm}:${ss}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

async function insertKillFacts(
  db: AppDb,
  matchId: number,
  kills: DemoKillFact[]
): Promise<KillSideRow[]> {
  const killSideRows: KillSideRow[] = []
  for (const kill of kills) {
    if (!kill.victimSteamid64) continue
    await db.run(sql`
      INSERT INTO match_kills (
        match_id, round, tick, attacker_steamid64, attacker_x, attacker_y, attacker_side,
        victim_steamid64, victim_x, victim_y, victim_side, weapon, headshot
      ) VALUES (
        ${matchId}, ${kill.round}, ${kill.tick}, ${kill.attackerSteamid64}, ${kill.attackerX}, ${kill.attackerY}, ${kill.attackerSide},
        ${kill.victimSteamid64}, ${kill.victimX}, ${kill.victimY}, ${kill.victimSide}, ${kill.weapon}, ${kill.headshot == null ? null : kill.headshot ? 1 : 0}
      )
    `)
    killSideRows.push({
      round: kill.round,
      attackerSteamid64: kill.attackerSteamid64,
      attackerSide: kill.attackerSide,
      victimSteamid64: kill.victimSteamid64,
      victimSide: kill.victimSide,
    })
  }
  return killSideRows
}

async function getKillSideRows(
  db: AppDb,
  matchId: number
): Promise<KillSideRow[]> {
  const rows = await db.all<{
    round: number
    attacker_steamid64: string | null
    attacker_side: "CT" | "T" | null
    victim_steamid64: string
    victim_side: "CT" | "T" | null
  }>(sql`
    SELECT round, attacker_steamid64, attacker_side, victim_steamid64, victim_side
    FROM match_kills WHERE match_id = ${matchId}
  `)
  return rows.map((row) => ({
    round: row.round,
    attackerSteamid64: row.attacker_steamid64,
    attackerSide: row.attacker_side,
    victimSteamid64: row.victim_steamid64,
    victimSide: row.victim_side,
  }))
}

async function persistResolvedTeams(
  db: AppDb,
  matchId: number,
  resolved: ResolvedTeams
) {
  await db.run(sql`
    UPDATE matches SET
      team_a_id = ${resolved.teamAId}, team_a_score = ${resolved.teamAScore},
      team_b_id = ${resolved.teamBId}, team_b_score = ${resolved.teamBScore},
      team_a_resolution = ${resolved.teamAResolution}, team_b_resolution = ${resolved.teamBResolution},
      team_resolution_conflict = ${resolved.teamResolutionConflict}
    WHERE id = ${matchId}
  `)
}

async function ingestDemo(
  db: AppDb,
  filePath: string,
  overrides: PlayerOverrides,
  summary: MatchingSummary,
  toornamentWindowHours: number,
  extract: Extraction
) {
  const now = new Date().toISOString()
  const facts = extract.demo(filePath)
  if (facts.status === "no-rounds") {
    console.warn(`[ingest-demos] no rounds found, skipping: ${filePath}`)
    return
  }
  if (facts.status === "incomplete") {
    console.warn(
      `[ingest-demos] match never reached a final score (dead artifact), skipping: ${filePath}`
    )
    return
  }
  const { header, roundEnds, totalRounds, players } = facts
  const fileName = path.basename(filePath)
  const demoDate = parseDemoTimestamp(fileName)
  if (!demoDate) {
    console.warn(
      `[ingest-demos] couldn't parse a timestamp from filename "${fileName}", falling back to ingestion time`
    )
  }
  const matchRows = await db.all<{ id: number }>(sql`
    INSERT INTO matches (file_name, map_name, server_name, demo_date, total_rounds, parsed_at)
    VALUES (${fileName}, ${header.map_name ?? null}, ${header.server_name ?? null}, ${demoDate ?? now}, ${totalRounds}, ${now})
    RETURNING id
  `)
  const matchId = matchRows[0].id
  const matching = await createDemoMatching({ db, overrides, summary })

  for (const stats of players) {
    if (!stats) {
      console.warn(
        `[ingest-demos] dropping player row with no steamid/name in ${fileName} (bot or upstream null-field bug)`
      )
      continue
    }
    await db.run(sql`
      INSERT INTO players (steamid64, latest_ingame_name, first_seen_at, last_seen_at)
      VALUES (${stats.steamid64}, ${stats.inGameName}, ${now}, ${now})
      ON CONFLICT(steamid64) DO UPDATE SET
        latest_ingame_name = excluded.latest_ingame_name,
        last_seen_at = excluded.last_seen_at
    `)
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
    await matching.matchPlayer(stats.steamid64, stats.inGameName)
  }
  const killRows = await insertKillFacts(db, matchId, facts.killFacts)
  const resolved = await resolveDemoTeams({
    db,
    filePath,
    roundEnds,
    killRows,
    matching,
    toleranceHours: toornamentWindowHours,
    demoDate: demoDate ?? now,
    readTicks: extract.sides,
  })
  await persistResolvedTeams(db, matchId, resolved)
  await persistRatingExtraction(db, matchId, facts.ratingFacts)
  if (facts.ratingFacts.unavailableReason) {
    console.warn(
      `[ingest-demos] unrated demo ${matchId}: ${facts.ratingFacts.unavailableReason}`
    )
  }
}

// Reload stored kill evidence, but still parse round ends and side snapshots.
async function reresolveTeams(
  db: AppDb,
  matchId: number,
  filePath: string,
  overrides: PlayerOverrides,
  summary: MatchingSummary,
  toornamentWindowHours: number,
  extract: Extraction
) {
  const matchRows = await db.all<{
    demo_date: string | null
    team_a_id: number | null
    team_a_resolution: TeamResolution
    team_b_id: number | null
    team_b_resolution: TeamResolution
  }>(sql`
    SELECT demo_date, team_a_id, team_a_resolution, team_b_id, team_b_resolution
    FROM matches WHERE id = ${matchId}
  `)
  const match = matchRows[0]
  if (!match) return
  const roundEnds = extract.rounds(filePath)
  const killRows = await getKillSideRows(db, matchId)
  const matching = await createDemoMatching({ db, overrides, summary, matchId })
  const resolved = await resolveDemoTeams({
    db,
    filePath,
    roundEnds,
    killRows,
    matching,
    toleranceHours: toornamentWindowHours,
    demoDate: match.demo_date ?? new Date().toISOString(),
    priorResolution: {
      teamAId: match.team_a_id,
      teamAResolution: match.team_a_resolution,
      teamBId: match.team_b_id,
      teamBResolution: match.team_b_resolution,
    },
    readTicks: extract.sides,
  })
  await persistResolvedTeams(db, matchId, resolved)
  if (resolved.teamResolutionConflict) {
    console.warn(
      `[ingest-demos] team resolution conflict for match ${matchId}: ${resolved.teamResolutionConflict}`
    )
  }
}

export async function runDemoIngestion({
  db,
  files,
  overrides,
  toornamentWindowHours,
  extract = extraction,
}: {
  db: AppDb
  files: string[]
  overrides: PlayerOverrides
  toornamentWindowHours: number
  extract?: Extraction
}) {
  const alreadyIngested = new Set(
    (
      await db.all<{ file_name: string }>(sql`SELECT file_name FROM matches`)
    ).map((row) => row.file_name)
  )
  const summary = emptyMatchingSummary()
  let ingested = 0
  let skipped = 0
  let reresolved = 0
  const failures: unknown[] = []
  const withKills = new Set(
    (
      await db.all<{ file_name: string }>(sql`
        SELECT DISTINCT m.file_name AS file_name
        FROM matches m JOIN match_kills k ON k.match_id = m.id
      `)
    ).map((row) => row.file_name)
  )
  const needsTeamReresolution = new Set(
    (
      await db.all<{ file_name: string; id: number }>(sql`
        SELECT file_name, id FROM matches
        WHERE team_a_id IS NULL OR team_b_id IS NULL OR team_resolution_conflict IS NOT NULL
      `)
    ).map((row) => row.file_name)
  )

  for (const file of files) {
    const name = path.basename(file)
    if (alreadyIngested.has(name)) {
      if (!withKills.has(name)) {
        const rows = await db.all<{ id: number }>(sql`
          SELECT id FROM matches WHERE file_name = ${name}
        `)
        console.log(`[ingest-demos] backfilling kills for ${name}`)
        try {
          await insertKillFacts(db, rows[0].id, extract.kills(file))
        } catch (error) {
          console.error(`[ingest-demos] failed to backfill ${file}:`, error)
          failures.push(error)
        }
      }
      if (needsTeamReresolution.has(name)) {
        const rows = await db.all<{ id: number }>(sql`
          SELECT id FROM matches WHERE file_name = ${name}
        `)
        console.log(`[ingest-demos] re-resolving teams for ${name}`)
        try {
          await reresolveTeams(
            db,
            rows[0].id,
            file,
            overrides,
            summary,
            toornamentWindowHours,
            extract
          )
          reresolved++
        } catch (error) {
          console.error(`[ingest-demos] failed to re-resolve ${file}:`, error)
          failures.push(error)
        }
      }
      skipped++
      continue
    }
    console.log(`[ingest-demos] parsing ${name}`)
    try {
      await ingestDemo(
        db,
        file,
        overrides,
        summary,
        toornamentWindowHours,
        extract
      )
      ingested++
    } catch (error) {
      console.error(`[ingest-demos] failed to parse ${file}:`, error)
      failures.push(error)
    }
  }
  return { ingested, skipped, reresolved, summary, failures }
}

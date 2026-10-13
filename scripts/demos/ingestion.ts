import path from "node:path"
import { sql } from "drizzle-orm"
import type { AppDb, AppDbQueries } from "@/lib/db/client"
import {
  extractDemoFacts,
  extractKillFacts,
  extractRoundEnds,
  type DemoBombPlant,
  type DemoKillFact,
} from "@/scripts/demos/domain/demo-extraction"
import { persistRatingExtractionInTransaction } from "@/lib/rating-db"
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
const MAX_DEMO_ATTEMPTS = 3
const RETRYABLE_DB_CODES = new Set([
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
])

type DemoTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0]

function parseDemoTimestamp(fileName: string): string | null {
  const match = DEMO_TIMESTAMP_RE.exec(fileName)
  if (!match) return null
  const [, date, hh, mm, ss] = match
  const parsed = new Date(`${date}T${hh}:${mm}:${ss}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

async function insertKillFacts(
  db: AppDbQueries,
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

async function insertBombPlants(
  db: AppDbQueries,
  matchId: number,
  plants: DemoBombPlant[]
): Promise<void> {
  for (const plant of plants) {
    const rows = await db.all<{ id: number }>(sql`
      INSERT INTO match_bomb_plants (
        match_id, round, tick, planter_steamid64, site, place_name, round_winner_side
      ) VALUES (
        ${matchId}, ${plant.round}, ${plant.tick}, ${plant.planterSteamid64},
        ${plant.site}, ${plant.placeName}, ${plant.roundWinnerSide}
      )
      RETURNING id
    `)
    const row = rows[0]
    if (!row)
      throw new Error(`Failed to persist bomb plant at tick ${plant.tick}`)
    for (const steamid64 of plant.ctSteamids64) {
      await db.run(sql`
        INSERT INTO match_bomb_plant_ct_players (bomb_plant_id, steamid64)
        VALUES (${row.id}, ${steamid64})
      `)
    }
  }
}

async function getKillSideRows(
  db: AppDbQueries,
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
  db: AppDbQueries,
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

function isRetryableDbError(error: unknown): boolean {
  const seen = new Set<object>()
  let current = error
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current)
    const value = current as { cause?: unknown; code?: unknown }
    if (typeof value.code === "string" && RETRYABLE_DB_CODES.has(value.code)) {
      return true
    }
    current = value.cause
  }
  return false
}

async function retryTransientDbOperation<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_DEMO_ATTEMPTS; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === MAX_DEMO_ATTEMPTS - 1) {
        throw error
      }
      const waitMs = 250 * 2 ** attempt
      console.warn(
        `[ingest-demos] transient database error for ${label}; retrying in ${waitMs}ms (attempt ${attempt + 2}/${MAX_DEMO_ATTEMPTS})`
      )
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
  throw new Error("Unreachable database retry state")
}

async function withDemoTransaction(
  db: AppDb,
  fileName: string,
  operation: (tx: DemoTransaction, summary: MatchingSummary) => Promise<void>
): Promise<MatchingSummary> {
  return retryTransientDbOperation(fileName, async () => {
    const summary = emptyMatchingSummary()
    await db.transaction((tx) => operation(tx, summary))
    return summary
  })
}

function addMatchingSummary(
  target: MatchingSummary,
  addition: MatchingSummary
) {
  target.manual += addition.manual
  target.autoHigh += addition.autoHigh
  target.autoLow += addition.autoLow
  target.ambiguous += addition.ambiguous
  target.unmatched += addition.unmatched
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
  let matchId: number | undefined
  const committedSummary = await withDemoTransaction(
    db,
    fileName,
    async (tx, attemptSummary) => {
      const existingMatches = await tx.all<{ id: number }>(sql`
        SELECT id FROM matches WHERE file_name = ${fileName}
      `)
      let currentMatchId: number
      if (existingMatches[0]) {
        currentMatchId = existingMatches[0].id
        await tx.run(
          sql`DELETE FROM match_kills WHERE match_id = ${currentMatchId}`
        )
        await tx.run(
          sql`DELETE FROM match_bomb_plants WHERE match_id = ${currentMatchId}`
        )
        await tx.run(
          sql`DELETE FROM player_match_stats WHERE match_id = ${currentMatchId}`
        )
        await tx.run(sql`
          UPDATE matches SET map_name = ${header.map_name ?? null},
            server_name = ${header.server_name ?? null}, demo_date = ${demoDate ?? now},
            total_rounds = ${totalRounds}, parsed_at = ${now}, team_a_id = NULL,
            team_a_score = NULL, team_b_id = NULL, team_b_score = NULL,
            team_a_resolution = NULL, team_b_resolution = NULL,
            team_resolution_conflict = NULL
          WHERE id = ${currentMatchId}
        `)
      } else {
        const matchRows = await tx.all<{ id: number }>(sql`
          INSERT INTO matches (file_name, map_name, server_name, demo_date, total_rounds, parsed_at)
          VALUES (${fileName}, ${header.map_name ?? null}, ${header.server_name ?? null}, ${demoDate ?? now}, ${totalRounds}, ${now})
          RETURNING id
        `)
        const insertedMatch = matchRows[0]
        if (!insertedMatch) throw new Error(`Failed to create demo ${fileName}`)
        currentMatchId = insertedMatch.id
      }
      matchId = currentMatchId
      const matching = await createDemoMatching({
        db: tx,
        overrides,
        summary: attemptSummary,
      })

      for (const stats of players) {
        if (!stats) {
          console.warn(
            `[ingest-demos] dropping player row with no steamid/name in ${fileName} (bot or upstream null-field bug)`
          )
          continue
        }
        await tx.run(sql`
          INSERT INTO players (steamid64, latest_ingame_name, first_seen_at, last_seen_at)
          VALUES (${stats.steamid64}, ${stats.inGameName}, ${now}, ${now})
          ON CONFLICT(steamid64) DO UPDATE SET
            latest_ingame_name = excluded.latest_ingame_name,
            last_seen_at = excluded.last_seen_at
        `)
        await tx.run(sql`
          INSERT INTO player_match_stats (
            match_id, steamid64, team_name, kills, deaths, assists, headshot_kills,
            damage_total, utility_damage_total, enemies_flashed_total, mvps,
            ace_rounds, rounds_3k, rounds_4k, equipment_value_total, adr, hs_pct
          ) VALUES (
            ${currentMatchId}, ${stats.steamid64}, ${stats.teamName}, ${stats.kills}, ${stats.deaths}, ${stats.assists}, ${stats.headshotKills},
            ${stats.damageTotal}, ${stats.utilityDamageTotal}, ${stats.enemiesFlashedTotal}, ${stats.mvps},
            ${stats.aceRounds}, ${stats.rounds3k}, ${stats.rounds4k}, ${stats.equipmentValueTotal}, ${stats.adr}, ${stats.hsPct}
          )
        `)
        await matching.matchPlayer(stats.steamid64, stats.inGameName)
      }
      const killRows = await insertKillFacts(
        tx,
        currentMatchId,
        facts.killFacts
      )
      await insertBombPlants(tx, currentMatchId, facts.bombPlants)
      const resolved = await resolveDemoTeams({
        db: tx,
        filePath,
        roundEnds,
        killRows,
        matching,
        toleranceHours: toornamentWindowHours,
        demoDate: demoDate ?? now,
        readTicks: extract.sides,
      })
      await persistResolvedTeams(tx, currentMatchId, resolved)
      await persistRatingExtractionInTransaction(
        tx,
        currentMatchId,
        facts.ratingFacts
      )
    }
  )
  addMatchingSummary(summary, committedSummary)
  if (matchId === undefined) {
    throw new Error(
      `Demo transaction completed without a match ID for ${fileName}`
    )
  }
  if (facts.ratingFacts.unavailableReason) {
    console.warn(
      `[ingest-demos] unrated demo ${matchId}: ${facts.ratingFacts.unavailableReason}`
    )
  }
}

// Reload stored kill evidence, but still parse round ends and side snapshots.
async function reresolveTeams(
  db: AppDbQueries,
  fileName: string,
  filePath: string,
  overrides: PlayerOverrides,
  summary: MatchingSummary,
  toornamentWindowHours: number,
  extract: Extraction
) {
  const matchRows = await db.all<{
    id: number
    demo_date: string | null
    team_a_id: number | null
    team_a_resolution: TeamResolution
    team_b_id: number | null
    team_b_resolution: TeamResolution
  }>(sql`
    SELECT id, demo_date, team_a_id, team_a_resolution, team_b_id, team_b_resolution
    FROM matches WHERE file_name = ${fileName}
  `)
  const match = matchRows[0]
  if (!match) return
  const matchId = match.id
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
  reparse = false,
  extract = extraction,
}: {
  db: AppDb
  files: string[]
  overrides: PlayerOverrides
  toornamentWindowHours: number
  reparse?: boolean
  extract?: Extraction
}) {
  const initialState = await retryTransientDbOperation(
    "ingestion preflight",
    async () => {
      const alreadyIngested = new Map(
        (
          await db.all<{ id: number; file_name: string }>(
            sql`SELECT id, file_name FROM matches`
          )
        ).map((row) => [row.file_name, row.id] as const)
      )
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
      return { alreadyIngested, withKills, needsTeamReresolution }
    }
  )
  const { alreadyIngested, withKills, needsTeamReresolution } = initialState
  const summary = emptyMatchingSummary()
  let ingested = 0
  let skipped = 0
  let reresolved = 0
  const failures: unknown[] = []

  for (const file of files) {
    const name = path.basename(file)
    const existingMatchId = alreadyIngested.get(name)
    if (existingMatchId !== undefined && !reparse) {
      if (!withKills.has(name)) {
        console.log(`[ingest-demos] backfilling kills for ${name}`)
        try {
          const kills = extract.kills(file)
          await withDemoTransaction(db, name, async (tx) => {
            const rows = await tx.all<{ id: number }>(sql`
              SELECT id FROM matches WHERE file_name = ${name}
            `)
            if (!rows[0]) throw new Error(`Unknown demo ${name}`)
            await tx.run(
              sql`DELETE FROM match_kills WHERE match_id = ${rows[0].id}`
            )
            await insertKillFacts(tx, rows[0].id, kills)
          })
        } catch (error) {
          console.error(`[ingest-demos] failed to backfill ${file}:`, error)
          failures.push(error)
        }
      }
      if (needsTeamReresolution.has(name)) {
        console.log(`[ingest-demos] re-resolving teams for ${name}`)
        try {
          const committedSummary = await withDemoTransaction(
            db,
            name,
            (tx, attemptSummary) =>
              reresolveTeams(
                tx,
                name,
                file,
                overrides,
                attemptSummary,
                toornamentWindowHours,
                extract
              )
          )
          addMatchingSummary(summary, committedSummary)
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

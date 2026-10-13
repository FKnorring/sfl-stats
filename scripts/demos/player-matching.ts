import { sql } from "drizzle-orm"
import type { AppDb, AppDbQueries } from "@/lib/db/client"
import {
  resolvePlayerMatch,
  type MatchCandidate,
  type MatchResult,
  type MatchStatus,
} from "@/lib/matching"

export type PlayerOverrides = Map<
  string,
  { rosterEntryId: number; note?: string }
>

export type MatchingSummary = {
  manual: number
  autoHigh: number
  autoLow: number
  ambiguous: number
  unmatched: number
}

export function emptyMatchingSummary(): MatchingSummary {
  return { manual: 0, autoHigh: 0, autoLow: 0, ambiguous: 0, unmatched: 0 }
}

const SUMMARY_KEY: Record<MatchStatus, keyof MatchingSummary> = {
  manual: "manual",
  auto_high: "autoHigh",
  auto_low: "autoLow",
  ambiguous: "ambiguous",
  unmatched: "unmatched",
}

const STATUS_PRIORITY: Record<MatchStatus, number> = {
  manual: 4,
  auto_high: 3,
  auto_low: 2,
  ambiguous: 1,
  unmatched: 0,
}

export async function applyOverrides(db: AppDb, overrides: PlayerOverrides) {
  const now = new Date().toISOString()
  for (const [steamid64, { rosterEntryId, note }] of overrides) {
    await db.run(sql`
      INSERT INTO player_name_overrides (steamid64, roster_entry_id, note, created_at)
      VALUES (${steamid64}, ${rosterEntryId}, ${note ?? null}, ${now})
      ON CONFLICT(steamid64) DO UPDATE SET
        roster_entry_id = excluded.roster_entry_id,
        note = excluded.note
    `)
    await updateRosterMatch(db, rosterEntryId, steamid64, {
      rosterEntryIds: [rosterEntryId],
      confidence: 1,
      status: "manual",
    })
  }
}

const CURRENT_SEASON_SQL = sql`team_id IN (
  SELECT id FROM teams WHERE season = (
    SELECT season FROM teams
    ORDER BY CAST(TRIM(REPLACE(season, 'SFL Säsong', '')) AS INTEGER) DESC
    LIMIT 1
  )
)`

async function getCandidates(db: AppDbQueries, teamId?: number) {
  const rows = await db.all<{ id: number; nickname: string }>(sql`
    SELECT id, nickname FROM roster_entries
    WHERE match_status IN ('unmatched', 'auto_low', 'auto_high')
      AND ${CURRENT_SEASON_SQL}
      ${teamId === undefined ? sql`` : sql`AND team_id = ${teamId}`}
  `)
  return rows.map((row) => ({
    rosterEntryId: row.id,
    nickname: row.nickname,
  }))
}

async function updateRosterMatch(
  db: AppDbQueries,
  rosterEntryId: number,
  steamid64: string,
  result: MatchResult
) {
  await db.run(sql`
    UPDATE roster_entries
    SET matched_steamid64 = ${steamid64},
        match_confidence = ${result.confidence}, match_status = ${result.status}
    WHERE id = ${rosterEntryId}
  `)
}

async function claimEntries(
  db: AppDbQueries,
  steamid64: string,
  result: MatchResult,
  candidates: MatchCandidate[]
) {
  for (const rosterEntryId of result.rosterEntryIds) {
    await updateRosterMatch(db, rosterEntryId, steamid64, result)
  }
  const claimed = new Set(result.rosterEntryIds)
  return candidates.filter((candidate) => !claimed.has(candidate.rosterEntryId))
}

export async function createDemoMatching({
  db,
  overrides,
  summary,
  matchId,
}: {
  db: AppDbQueries
  overrides: PlayerOverrides
  summary: MatchingSummary
  matchId?: number
}) {
  let candidates = matchId === undefined ? await getCandidates(db) : []
  const steamidToTeam = new Map<string, number>()
  const steamidToInGameName = new Map<string, string>()
  const outcomes = new Map<string, MatchStatus>()

  function recordOutcome(steamid64: string, status: MatchStatus) {
    const previous = outcomes.get(steamid64)
    if (previous !== undefined) summary[SUMMARY_KEY[previous]]--
    outcomes.set(steamid64, status)
    summary[SUMMARY_KEY[status]]++
  }

  if (matchId !== undefined) {
    const rows = await db.all<{
      steamid64: string
      inGameName: string
      teamId: number | null
      matchStatus: MatchStatus | null
    }>(sql`
      SELECT pms.steamid64 AS steamid64, p.latest_ingame_name AS inGameName,
             re.team_id AS teamId, re.match_status AS matchStatus
      FROM player_match_stats pms
      JOIN players p ON p.steamid64 = pms.steamid64
      LEFT JOIN roster_entries re ON re.matched_steamid64 = pms.steamid64
      WHERE pms.match_id = ${matchId}
    `)
    for (const row of rows) {
      steamidToInGameName.set(row.steamid64, row.inGameName)
      if (row.teamId != null) steamidToTeam.set(row.steamid64, row.teamId)
      const status = overrides.has(row.steamid64)
        ? "manual"
        : (row.matchStatus ?? "unmatched")
      const previous = outcomes.get(row.steamid64)
      if (
        previous === undefined ||
        STATUS_PRIORITY[status] > STATUS_PRIORITY[previous]
      ) {
        recordOutcome(row.steamid64, status)
      }
    }
  }

  return {
    steamidToTeam,
    steamidToInGameName,
    async matchPlayer(steamid64: string, inGameName: string) {
      steamidToInGameName.set(steamid64, inGameName)
      const result = resolvePlayerMatch(
        inGameName,
        candidates,
        overrides.get(steamid64)
      )
      if (result.status !== "manual" && result.rosterEntryIds.length > 0) {
        candidates = await claimEntries(db, steamid64, result, candidates)
      }
      recordOutcome(steamid64, result.status)

      if (result.status === "manual" || result.rosterEntryIds.length > 0) {
        const rows = await db.all<{ team_id: number }>(sql`
          SELECT team_id FROM roster_entries WHERE id = ${result.rosterEntryIds[0]}
        `)
        if (rows[0]) steamidToTeam.set(steamid64, rows[0].team_id)
      }
    },
    async anchorPlayers(teamId: number, steamids: string[]) {
      let teamCandidates = await getCandidates(db, teamId)
      for (const steamid64 of steamids) {
        const inGameName = steamidToInGameName.get(steamid64)
        if (!inGameName) continue
        const result = resolvePlayerMatch(
          inGameName,
          teamCandidates,
          overrides.get(steamid64)
        )
        if (result.rosterEntryIds.length === 0) continue
        teamCandidates = await claimEntries(
          db,
          steamid64,
          result,
          teamCandidates
        )
        steamidToTeam.set(steamid64, teamId)
        recordOutcome(steamid64, result.status)
      }
    },
  }
}

export type DemoMatching = Awaited<ReturnType<typeof createDemoMatching>>

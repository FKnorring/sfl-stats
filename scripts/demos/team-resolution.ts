import { parseTicks } from "@laihoe/demoparser2"
import { sql } from "drizzle-orm"
import { z } from "zod"
import type { AppDb } from "@/lib/db/client"
import type { RoundEndRow } from "@/lib/demo-stats"
import {
  deriveStableTeamSides,
  findClosestToornamentMatch,
  type KillSideRow,
} from "@/lib/team-anchoring"
import type { DemoMatching } from "./player-matching"

export type TeamResolution = "player_match" | "toornament_inferred" | null

export type ResolvedTeams = {
  teamAId: number | null
  teamAScore: number | null
  teamBId: number | null
  teamBScore: number | null
  teamAResolution: TeamResolution
  teamBResolution: TeamResolution
  teamResolutionConflict: string | null
}

type PriorResolution = Pick<
  ResolvedTeams,
  "teamAId" | "teamAResolution" | "teamBId" | "teamBResolution"
>

const sideTickSchema = z.object({
  tick: z.number(),
  player_steamid: z.string().nullish(),
  team_name: z.string().nullish(),
})

export type ReadSideTicks = (filePath: string, ticks: number[]) => unknown

const readSideTicks: ReadSideTicks = (filePath, ticks) =>
  parseTicks(filePath, ["player_steamid", "team_name"], ticks)

// round_end uses CT/T; tick snapshots use CT/TERRORIST.
function normalizeSide(side: string): string {
  return side[0]
}

function computeTeamScore(
  filePath: string,
  rounds: RoundEndRow[],
  steamidToTeam: Map<string, number>,
  readTicks: ReadSideTicks
): Pick<ResolvedTeams, "teamAId" | "teamAScore" | "teamBId" | "teamBScore"> {
  const unresolved = {
    teamAId: null,
    teamAScore: null,
    teamBId: null,
    teamBScore: null,
  }
  const teamIds = [...new Set(steamidToTeam.values())]
  if (teamIds.length === 0 || teamIds.length > 2) return unresolved
  const [teamAId, teamBId] = teamIds
  const decidedRounds = rounds.filter((round) => round.winner)
  if (decidedRounds.length === 0) return unresolved
  if (teamBId == null) {
    return { teamAId, teamAScore: null, teamBId: null, teamBScore: null }
  }

  const sideTicks = z.array(sideTickSchema).parse(
    readTicks(
      filePath,
      decidedRounds.map((round) => round.tick)
    )
  )
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
      const entries = Object.entries(sideCounts.get(teamId)!)
      if (entries.length === 0) return null
      return entries.sort((a, b) => b[1] - a[1])[0][0]
    }
    const winnerSide = round.winner ? normalizeSide(round.winner) : null
    const teamASide = sideOf(teamAId)
    const teamBSide = sideOf(teamBId)
    if (teamASide && teamASide === winnerSide) teamAScore++
    else if (teamBSide && teamBSide === winnerSide) teamBScore++
  }
  return { teamAId, teamAScore, teamBId, teamBScore }
}

async function getCompletedToornamentMatchesForTeam(db: AppDb, teamId: number) {
  const rows = await db.all<{
    id: number
    scheduled_at: string
    team_a_id: number | null
    team_b_id: number | null
  }>(sql`
    SELECT id, scheduled_at, team_a_id, team_b_id FROM toornament_matches
    WHERE status = 'completed' AND scheduled_at IS NOT NULL
      AND (team_a_id = ${teamId} OR team_b_id = ${teamId})
  `)
  return rows
    .map((row) => ({
      toornamentMatchId: row.id,
      scheduledAt: row.scheduled_at,
      opponentTeamId: row.team_a_id === teamId ? row.team_b_id : row.team_a_id,
    }))
    .filter(
      (row): row is typeof row & { opponentTeamId: number } =>
        row.opponentTeamId != null
    )
}

export async function resolveDemoTeams({
  db,
  filePath,
  roundEnds,
  killRows,
  matching,
  toleranceHours,
  demoDate,
  priorResolution = null,
  readTicks = readSideTicks,
}: {
  db: AppDb
  filePath: string
  roundEnds: RoundEndRow[]
  killRows: KillSideRow[]
  matching: DemoMatching
  toleranceHours: number
  demoDate: string
  priorResolution?: PriorResolution | null
  readTicks?: ReadSideTicks
}): Promise<ResolvedTeams> {
  const stableSides = deriveStableTeamSides(killRows)
  const sideBuckets = new Map<"A" | "B", string[]>([
    ["A", []],
    ["B", []],
  ])
  for (const [steamid64, side] of stableSides) {
    sideBuckets.get(side)!.push(steamid64)
  }

  for (const steamids of sideBuckets.values()) {
    const anchorCounts = new Map<number, number>()
    for (const steamid64 of steamids) {
      const teamId = matching.steamidToTeam.get(steamid64)
      if (teamId == null) continue
      anchorCounts.set(teamId, (anchorCounts.get(teamId) ?? 0) + 1)
    }
    if (anchorCounts.size === 0) continue
    const anchors = [...anchorCounts.entries()].sort((a, b) => b[1] - a[1])
    if (anchors[1]?.[1] === anchors[0][1]) continue
    const anchorTeamId = anchors[0][0]
    const unmatched = steamids.filter((id) => !matching.steamidToTeam.has(id))
    if (unmatched.length) await matching.anchorPlayers(anchorTeamId, unmatched)
  }

  const score = computeTeamScore(
    filePath,
    roundEnds,
    matching.steamidToTeam,
    readTicks
  )
  let teamAId = score.teamAId
  let teamBId = score.teamBId
  let teamAResolution: TeamResolution = teamAId != null ? "player_match" : null
  let teamBResolution: TeamResolution = teamBId != null ? "player_match" : null
  let teamResolutionConflict: string | null = null

  if (teamAId != null && teamBId == null) {
    const fallback = findClosestToornamentMatch(
      demoDate,
      await getCompletedToornamentMatchesForTeam(db, teamAId),
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
    const fallback = findClosestToornamentMatch(
      demoDate,
      await getCompletedToornamentMatchesForTeam(db, teamBId),
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

import { sql } from "drizzle-orm"
import type { TeamRosterPlayerRow } from "@/lib/db"

// Unanchored demos have no independent season field. Roster evidence is
// retained only where it does not conflict with an anchored same-side team.
export function teamDemoScope(teamId: number) {
  return sql`(
    m.team_a_id = ${teamId} OR m.team_b_id = ${teamId}
    OR (
      (m.team_a_id IS NULL OR m.team_b_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM player_match_stats evidence
        JOIN roster_entries own ON own.matched_steamid64 = evidence.steamid64
        WHERE evidence.match_id = m.id AND own.team_id = ${teamId}
          AND NOT EXISTS (
            SELECT 1 FROM player_match_stats conflicting
            JOIN roster_entries other ON other.matched_steamid64 = conflicting.steamid64
            WHERE conflicting.match_id = m.id
              AND conflicting.team_name IS evidence.team_name
              AND other.team_id != ${teamId}
              AND other.team_id IN (m.team_a_id, m.team_b_id)
          )
      )
    )
  )`
}

export function teamMvp(
  roster: TeamRosterPlayerRow[]
): TeamRosterPlayerRow | null {
  return (
    roster
      .filter(
        (player) =>
          player.matchesPlayed > 0 &&
          player.adr !== null &&
          Number.isFinite(player.adr)
      )
      .sort(
        (a, b) =>
          (b.adr ?? 0) - (a.adr ?? 0) ||
          b.kills / Math.max(b.deaths, 1) - a.kills / Math.max(a.deaths, 1) ||
          b.matchesPlayed - a.matchesPlayed ||
          a.rosterEntryId - b.rosterEntryId
      )[0] ?? null
  )
}

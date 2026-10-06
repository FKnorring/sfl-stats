"use client"

import type { TeamRosterPlayerRow } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import {
  buildTeamRosterColumns,
  type TeamRosterTableRow,
} from "@/components/team-roster-columns"

type FaceitLookup = Map<string, { faceitNickname: string; elo: number | null }>

/**
 * Single-team roster table: same demo-derived stat columns as
 * app/teams/compare/page.tsx's RosterTable, plus an Accounts column for
 * viewing/correcting the steamID match and viewing (read-only) the Faceit
 * link. Columns are shared with the compare view via
 * components/team-roster-columns.tsx; only the Accounts column differs.
 */
export function TeamRosterTable({
  teamName,
  roster,
  faceitStats,
}: {
  teamName: string
  roster: TeamRosterPlayerRow[]
  faceitStats: FaceitLookup
}) {
  const rows: TeamRosterTableRow[] = roster.map((row) => {
    const faceit = row.steamid64 ? faceitStats.get(row.steamid64) : undefined
    return {
      ...row,
      faceitElo: faceit?.elo ?? null,
      faceitNickname: faceit?.faceitNickname ?? null,
    }
  })

  const columns = buildTeamRosterColumns({ teamName, includeAccounts: true })

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="No roster entries for this team."
    />
  )
}

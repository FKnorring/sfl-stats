"use client"

import { DataTable } from "@/components/data-table/data-table"
import {
  buildTeamRosterColumns,
  type TeamRosterTableRow,
} from "@/components/team-roster-columns"

// Thin client wrapper, same reasoning as app/leaderboard/leaderboard-table.tsx
// and app/teams/team-standings-table.tsx: column defs contain function
// values, so they're built here on the client side rather than in the
// Server Component page and passed down as a prop.
const columns = buildTeamRosterColumns({ includeAccounts: false })

export function CompareRosterTable({ rows }: { rows: TeamRosterTableRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowPlayerId={(r) => r.steamid64}
      emptyMessage="No roster entries for this team."
    />
  )
}

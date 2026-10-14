"use client"

import { DataTable } from "@/components/data-table/data-table"
import { useFollowRowClass } from "@/components/follow-indicator"
import { useFunMode } from "@/lib/fun-mode"
import {
  buildTeamRosterColumns,
  type TeamRosterTableRow,
} from "@/components/team-roster-columns"

// Thin client wrapper, same reasoning as app/leaderboard/leaderboard-table.tsx
// and app/teams/team-standings-table.tsx: column defs contain function
// values, so they're built here on the client side rather than in the
// Server Component page and passed down as a prop.
export function CompareRosterTable({
  rows,
  teamId,
}: {
  rows: TeamRosterTableRow[]
  teamId: number
}) {
  const funMode = useFunMode()
  const columns = buildTeamRosterColumns({
    includeAccounts: false,
    includeShrimpKills: funMode,
    teamId,
  })
  const rowClass = useFollowRowClass()
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowClassName={() => rowClass(teamId)}
      getRowPlayerId={(r) => r.steamid64}
      emptyMessage="No roster entries for this team."
    />
  )
}

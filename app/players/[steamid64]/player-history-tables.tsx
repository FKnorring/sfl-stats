"use client"

import type { PlayerMatchHistoryRow } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import { useFollowRowClass } from "@/components/follow-indicator"
import { matchHistoryColumns } from "./columns"

// Thin client wrapper, same reasoning as the other */*-table.tsx files:
// column defs contain function values, so they're built here on the
// client side rather than in the Server Component page and passed down
// as a prop.
export function MatchHistoryTable({ rows }: { rows: PlayerMatchHistoryRow[] }) {
  const rowClass = useFollowRowClass()
  return (
    <DataTable
      columns={matchHistoryColumns}
      data={rows}
      getRowClassName={(row) =>
        rowClass(row.teamId) ?? rowClass(row.opponentTeamId)
      }
      emptyMessage="No match history found."
      getRowHref={(row) => `/matches/demo/${row.matchId}`}
    />
  )
}

"use client"

import type { PlayerRosterHistoryRow, PlayerMatchHistoryRow } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import { teamHistoryColumns, matchHistoryColumns } from "./columns"

// Thin client wrappers, same reasoning as the other */*-table.tsx files:
// column defs contain function values, so they're built here on the
// client side rather than in the Server Component page and passed down
// as a prop.
export function TeamHistoryTable({ rows }: { rows: PlayerRosterHistoryRow[] }) {
  return (
    <DataTable
      columns={teamHistoryColumns}
      data={rows}
      emptyMessage="No roster history found."
    />
  )
}

export function MatchHistoryTable({ rows }: { rows: PlayerMatchHistoryRow[] }) {
  return (
    <DataTable
      columns={matchHistoryColumns}
      data={rows}
      emptyMessage="No match history found."
    />
  )
}

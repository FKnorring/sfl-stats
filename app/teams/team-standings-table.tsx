"use client"

import { DataTable } from "@/components/data-table/data-table"
import { useFollowRowClass } from "@/components/follow-indicator"
import { teamStandingsColumns, type TeamStandingTableRow } from "./columns"

// Thin client wrapper: `teamStandingsColumns` contains function-valued
// header/cell renderers, so it can't be imported into the Server Component
// page and passed down as a `DataTable` prop — only plain serializable row
// data crosses that boundary. The column defs are referenced here instead,
// on the client side.
export function TeamStandingsTable({
  rows,
  emptyMessage,
}: {
  rows: TeamStandingTableRow[]
  emptyMessage: string
}) {
  const rowClass = useFollowRowClass()
  return (
    <DataTable
      columns={teamStandingsColumns}
      data={rows}
      getRowClassName={(row) => rowClass(row.teamId)}
      emptyMessage={emptyMessage}
    />
  )
}

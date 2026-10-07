"use client"

import { DataTable } from "@/components/data-table/data-table"
import { useFollowRowClass } from "@/components/follow-indicator"
import { demoMatchPlayerColumns, type DemoMatchPlayerRow } from "./columns"

// Thin client wrapper, same reasoning as the other */*-table.tsx files:
// column defs contain function values, so they're built here on the
// client side rather than in the Server Component page and passed down
// as a prop.
export function DemoMatchTable({
  rows,
  selectedSteamid64,
  onSelect,
}: {
  rows: DemoMatchPlayerRow[]
  selectedSteamid64: string | null
  onSelect: (steamid64: string) => void
}) {
  const rowClass = useFollowRowClass()
  return (
    <DataTable
      columns={demoMatchPlayerColumns}
      data={rows}
      getRowPlayerId={(r) => r.steamid64}
      tableClassName="table-fixed"
      emptyMessage="No player stats found for this match."
      onRowClick={(row) => onSelect(row.steamid64)}
      getRowClassName={(row) =>
        [
          rowClass(row.rosterTeamId),
          row.steamid64 === selectedSteamid64 ? "bg-muted" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    />
  )
}

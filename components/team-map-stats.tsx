"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { TeamMapStat } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

const columns: ColumnDef<TeamMapStat>[] = [
  {
    accessorKey: "mapName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Map" />
    ),
    meta: { className: "font-medium" },
  },
  {
    accessorKey: "matchesPlayed",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Matches" />
    ),
    meta: { className: "text-right" },
  },
  {
    accessorKey: "winRate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Win%" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) =>
      row.original.winRate != null
        ? `${row.original.wins}-${row.original.losses} (${Math.round(row.original.winRate * 100)}%)`
        : "—",
  },
]

export function TeamMapStats({ maps }: { maps: TeamMapStat[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Maps played</h2>
      {maps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingested demos for this team yet.
        </p>
      ) : (
        <DataTable columns={columns} data={maps} />
      )}
      <p className="text-xs text-muted-foreground">
        More scouting data — win rates, recent form — coming soon.
      </p>
    </div>
  )
}

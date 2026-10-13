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
  {
    accessorKey: "plantsA",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="T plants" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) => {
      const { plantsA, plantsB } = row.original
      const total = plantsA + plantsB
      return total > 0
        ? `A ${plantsA} / B ${plantsB} (${Math.round((plantsA / total) * 100)}% A)`
        : "—"
    },
  },
  {
    accessorKey: "postPlantWinRateA",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Post-plant wins" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) => {
      const { postPlantWinRateA, postPlantWinRateB } = row.original
      if (postPlantWinRateA == null && postPlantWinRateB == null) return "—"
      const format = (rate: number | null) =>
        rate == null ? "—" : `${Math.round(rate * 100)}%`
      return `A ${format(postPlantWinRateA)} / B ${format(postPlantWinRateB)}`
    },
  },
  {
    accessorKey: "opponentPlantsA",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Plants against (CT)" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) =>
      row.original.opponentPlantsA + row.original.opponentPlantsB > 0
        ? `A ${row.original.opponentPlantsA} / B ${row.original.opponentPlantsB}`
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
        Bombsite stats are available for demos parsed with --reparse.
      </p>
    </div>
  )
}

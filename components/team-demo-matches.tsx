"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { TeamDemoMatchRow } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { formatMapName } from "@/lib/map-images"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const columns: ColumnDef<TeamDemoMatchRow>[] = [
  {
    accessorKey: "demoDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatDate(row.original.demoDate),
  },
  {
    accessorKey: "mapName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Map" />
    ),
    cell: ({ row }) => formatMapName(row.original.mapName) ?? "—",
  },
  {
    accessorKey: "opponentTeamName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Opponent" />
    ),
    cell: ({ row }) => row.original.opponentTeamName ?? "—",
  },
  {
    accessorKey: "teamScore",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Score" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) =>
      row.original.teamScore != null && row.original.opponentScore != null
        ? `${row.original.teamScore}–${row.original.opponentScore}`
        : "—",
  },
]

/**
 * Ingested demos for this team, linking to the same /matches/demo/[matchId]
 * page the player match history links to. Rendered below the maps-played
 * stats on the team page — see getTeamDemoMatches.
 */
export function TeamDemoMatches({ matches }: { matches: TeamDemoMatchRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Demos</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingested demos for this team yet.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={matches}
          getRowHref={(row) => `/matches/demo/${row.matchId}`}
        />
      )}
    </div>
  )
}

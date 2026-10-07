"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { TeamDemoMatchRow } from "@/lib/db"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { formatMapName } from "@/lib/map-images"
import {
  FollowIndicator,
  useFollowRowClass,
} from "@/components/follow-indicator"

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

function buildColumns(teamId?: number): ColumnDef<TeamDemoMatchRow>[] {
  return [
    {
      accessorKey: "demoDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {formatDate(row.original.demoDate)}
          <FollowIndicator teamId={teamId} />
        </div>
      ),
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.opponentTeamName ?? "—"}
          <FollowIndicator teamId={row.original.opponentTeamId} />
        </div>
      ),
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
}

/**
 * Ingested demos for this team, linking to the same /matches/demo/[matchId]
 * page the player match history links to. Rendered below the maps-played
 * stats on the team page — see getTeamDemoMatches.
 */
export function TeamDemoMatches({
  matches,
  title = "Demos",
  teamId,
}: {
  matches: TeamDemoMatchRow[]
  title?: string
  teamId?: number
}) {
  const rowClass = useFollowRowClass()
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingested demos for this team yet.
        </p>
      ) : (
        <DataTable
          columns={buildColumns(teamId)}
          data={matches}
          getRowClassName={(row) =>
            rowClass(teamId) ?? rowClass(row.opponentTeamId)
          }
          getRowHref={(row) => `/matches/demo/${row.matchId}`}
        />
      )}
    </div>
  )
}

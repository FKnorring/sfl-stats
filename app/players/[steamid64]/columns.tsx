import type { ColumnDef } from "@tanstack/react-table"
import type { PlayerMatchHistoryRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { FollowIndicator } from "@/components/follow-indicator"
import { RatingValue } from "@/components/player-rating"

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

const rightAlign = { className: "text-right" }

export const matchHistoryColumns: ColumnDef<PlayerMatchHistoryRow>[] = [
  {
    accessorKey: "demoDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {formatDate(row.original.demoDate)}
        <FollowIndicator teamId={row.original.teamId} />
      </div>
    ),
  },
  {
    accessorKey: "mapName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Map" />
    ),
    cell: ({ row }) => row.original.mapName ?? "—",
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
    id: "rating",
    accessorFn: (row) => row.rating ?? undefined,
    sortUndefined: "last",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SFL Rating" />
    ),
    meta: rightAlign,
    cell: ({ row }) => (
      <RatingValue
        rating={row.original.rating}
        reason={row.original.ratingUnavailableReason}
        teamName={row.original.teamName}
      />
    ),
  },
  {
    accessorKey: "kills",
    header: ({ column }) => <DataTableColumnHeader column={column} title="K" />,
    meta: rightAlign,
    cell: ({ row }) => row.original.kills,
  },
  {
    accessorKey: "deaths",
    header: ({ column }) => <DataTableColumnHeader column={column} title="D" />,
    meta: rightAlign,
    cell: ({ row }) => row.original.deaths,
  },
  {
    accessorKey: "assists",
    header: ({ column }) => <DataTableColumnHeader column={column} title="A" />,
    meta: rightAlign,
    cell: ({ row }) => row.original.assists,
  },
  {
    accessorKey: "adr",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ADR" />
    ),
    meta: rightAlign,
    cell: ({ row }) =>
      row.original.adr != null ? row.original.adr.toFixed(1) : "—",
  },
  {
    accessorKey: "hsPct",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="HS%" />
    ),
    meta: rightAlign,
    cell: ({ row }) =>
      row.original.hsPct != null
        ? `${(row.original.hsPct * 100).toFixed(1)}%`
        : "—",
  },
]

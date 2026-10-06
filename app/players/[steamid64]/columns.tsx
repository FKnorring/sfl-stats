import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { PlayerRosterHistoryRow, PlayerMatchHistoryRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

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

export const teamHistoryColumns: ColumnDef<PlayerRosterHistoryRow>[] = [
  {
    accessorKey: "teamName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    meta: { className: "font-medium" },
    cell: ({ row }) => (
      <Link
        href={`/teams/${encodeURIComponent(row.original.teamName)}`}
        className="underline-offset-4 hover:underline"
      >
        {row.original.teamName}
      </Link>
    ),
  },
  {
    accessorKey: "season",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Season" />
    ),
  },
  {
    accessorKey: "division",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Division" />
    ),
  },
  {
    accessorKey: "matchStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Match status" />
    ),
  },
]

export const matchHistoryColumns: ColumnDef<PlayerMatchHistoryRow>[] = [
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
    cell: ({ row }) => row.original.mapName ?? "—",
  },
  {
    accessorKey: "kills",
    header: ({ column }) => <DataTableColumnHeader column={column} title="K" />,
    meta: rightAlign,
  },
  {
    accessorKey: "deaths",
    header: ({ column }) => <DataTableColumnHeader column={column} title="D" />,
    meta: rightAlign,
  },
  {
    accessorKey: "assists",
    header: ({ column }) => <DataTableColumnHeader column={column} title="A" />,
    meta: rightAlign,
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

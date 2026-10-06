import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { DemoMatchPlayerStatsRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

export type DemoMatchPlayerRow = DemoMatchPlayerStatsRow & {
  avatarUrl: string | null
}

const rightAlign = { className: "text-right" }

export const demoMatchPlayerColumns: ColumnDef<DemoMatchPlayerRow>[] = [
  {
    accessorKey: "inGameName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Player" />
    ),
    meta: { className: "font-medium" },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small, variable-source external avatars, same tradeoff as team logos
          <img
            src={row.original.avatarUrl}
            alt=""
            className="size-6 rounded border border-border object-cover"
          />
        ) : (
          <div className="size-6 rounded border border-border bg-muted" />
        )}
        <Link
          href={`/players/${encodeURIComponent(row.original.steamid64)}`}
          className="underline-offset-4 hover:underline"
        >
          {row.original.inGameName}
        </Link>
      </div>
    ),
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
  {
    accessorKey: "mvps",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="MVPs" />
    ),
    meta: rightAlign,
    cell: ({ row }) => row.original.mvps ?? "—",
  },
]

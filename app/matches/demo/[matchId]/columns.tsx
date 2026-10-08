import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { DemoMatchPlayerStatsRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { FollowIndicator } from "@/components/follow-indicator"
import { RatingValue } from "@/components/player-rating"

export type DemoMatchPlayerRow = DemoMatchPlayerStatsRow & {
  avatarUrl: string | null
}

// Fixed width so both team tables (stacked, table-fixed) share identical
// column edges.
const rightAlign = { className: "w-16 text-right" }

// Sort button sits in the header cell with built-in padding and its icon
// after the label; flip it so the label's right edge lines up with the
// right-aligned numbers below it.
const numHeader = "ml-0 -mr-2.5 flex-row-reverse"

export const demoMatchPlayerColumns: ColumnDef<DemoMatchPlayerRow>[] = [
  {
    accessorKey: "inGameName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Player" />
    ),
    meta: { className: "font-medium" },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <FollowIndicator teamId={row.original.rosterTeamId} />
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
        <span>{row.original.inGameName}</span>
        <Link
          href={`/players/${encodeURIComponent(row.original.steamid64)}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${row.original.inGameName}'s profile`}
          title="Player profile"
          className="text-muted-foreground hover:text-foreground"
        >
          ↗
        </Link>
      </div>
    ),
  },
  {
    accessorKey: "rating",
    sortUndefined: "last",
    accessorFn: (row) => row.rating ?? undefined,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="SFL"
        className={numHeader}
      />
    ),
    meta: rightAlign,
    cell: ({ row }) => (
      <RatingValue
        rating={row.original.rating}
        reason={row.original.ratingUnavailableReason}
      />
    ),
  },
  {
    accessorKey: "kills",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="K" className={numHeader} />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "deaths",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="D" className={numHeader} />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "assists",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="A" className={numHeader} />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "adr",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="ADR"
        className={numHeader}
      />
    ),
    meta: rightAlign,
    cell: ({ row }) =>
      row.original.adr != null ? row.original.adr.toFixed(1) : "—",
  },
  {
    accessorKey: "hsPct",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="HS%"
        className={numHeader}
      />
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
      <DataTableColumnHeader
        column={column}
        title="MVPs"
        className={numHeader}
      />
    ),
    meta: rightAlign,
    cell: ({ row }) => row.original.mvps ?? "—",
  },
]

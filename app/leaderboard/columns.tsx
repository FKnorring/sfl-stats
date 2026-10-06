import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { LeaderboardRow, LeaderboardStat } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"

// The leaderboard row shape as rendered by the table: the raw DB row plus
// Faceit stats pre-joined into plain, serializable fields (the lookup Map
// built server-side in page.tsx isn't itself passed across the server/
// client boundary).
export type LeaderboardTableRow = LeaderboardRow & {
  faceitElo: number | null
  faceitRecent: string
  avatarUrl: string | null
}

function formatStat(stat: LeaderboardStat, value: number): string {
  if (stat === "hs_pct") return `${(value * 100).toFixed(1)}%`
  if (stat === "adr") return value.toFixed(1)
  return String(Math.round(value))
}

const rightAlign = { className: "text-right" }

export function buildLeaderboardColumns(
  stat: LeaderboardStat,
  statLabel: string | undefined
): ColumnDef<LeaderboardTableRow>[] {
  return [
    {
      id: "rank",
      header: "#",
      cell: ({ row }) => row.index + 1,
      enableSorting: false,
      meta: { className: "w-10 text-muted-foreground" },
    },
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
          {row.original.matchStatus &&
          row.original.matchStatus !== "manual" &&
          row.original.matchStatus !== "auto_high" ? (
            <Badge variant="outline" className="text-amber-600">
              {row.original.matchStatus === "auto_low"
                ? "low-confidence match"
                : row.original.matchStatus}
            </Badge>
          ) : null}
          {!row.original.teamName ? (
            <Badge variant="outline" className="text-destructive">
              unmatched
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "teamName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Team" />
      ),
      cell: ({ row }) => row.original.teamName ?? "—",
    },
    {
      accessorKey: "division",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Division" />
      ),
      cell: ({ row }) => row.original.division ?? "—",
    },
    {
      accessorKey: "matchesPlayed",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Matches" />
      ),
      meta: rightAlign,
    },
    {
      accessorKey: "kills",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="K" />
      ),
      meta: rightAlign,
    },
    {
      accessorKey: "deaths",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="D" />
      ),
      meta: rightAlign,
    },
    {
      accessorKey: "assists",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="A" />
      ),
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
      accessorKey: "statValue",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={statLabel ?? "Stat"} />
      ),
      meta: { className: "text-right font-medium" },
      cell: ({ row }) => formatStat(stat, row.original.statValue),
    },
    {
      accessorKey: "faceitElo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Faceit Elo" />
      ),
      meta: rightAlign,
      cell: ({ row }) => row.original.faceitElo ?? "—",
    },
    {
      accessorKey: "faceitRecent",
      header: "Faceit (7d)",
      enableSorting: false,
      meta: rightAlign,
    },
  ]
}

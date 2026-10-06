import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { TeamStandingRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { TeamCompareCheckbox } from "@/components/team-compare-picker"

// Team standings row as rendered by the table: the raw DB row plus Faceit
// team stats pre-joined into plain, serializable fields.
export type TeamStandingTableRow = TeamStandingRow & {
  faceitAvgElo: number | null
  faceitRecent: string
}

const rightAlign = { className: "text-right" }

export const teamStandingsColumns: ColumnDef<TeamStandingTableRow>[] = [
  {
    id: "compare",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <TeamCompareCheckbox
        teamId={row.original.teamId}
        teamName={row.original.teamName}
      />
    ),
    meta: { className: "w-10" },
  },
  {
    id: "rank",
    header: "#",
    enableSorting: false,
    cell: ({ row }) => row.index + 1,
    meta: { className: "w-10 text-muted-foreground" },
  },
  {
    accessorKey: "teamName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    meta: { className: "font-medium" },
    cell: ({ row }) => (
      <Link
        href={`/teams/${encodeURIComponent(row.original.teamName)}`}
        className="flex items-center gap-2 underline-offset-4 hover:underline"
      >
        {row.original.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the table it replaces: small, variable-source external logos
          <img
            src={row.original.logoUrl}
            alt=""
            className="size-8 rounded border border-border object-cover"
          />
        ) : (
          <div className="size-8 rounded border border-border bg-muted" />
        )}
        {row.original.teamName}
      </Link>
    ),
  },
  {
    accessorKey: "wins",
    header: ({ column }) => <DataTableColumnHeader column={column} title="W" />,
    meta: rightAlign,
  },
  {
    accessorKey: "losses",
    header: ({ column }) => <DataTableColumnHeader column={column} title="L" />,
    meta: rightAlign,
  },
  {
    accessorKey: "matchesPlayed",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Matches" />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "totalKills",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Kills" />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "totalDeaths",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Deaths" />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "faceitAvgElo",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Avg Faceit Elo" />
    ),
    meta: rightAlign,
    cell: ({ row }) =>
      row.original.faceitAvgElo != null
        ? Math.round(row.original.faceitAvgElo)
        : "—",
  },
  {
    accessorKey: "faceitRecent",
    header: "Faceit (7d)",
    enableSorting: false,
    meta: rightAlign,
  },
]

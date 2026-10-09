import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { OfficialStanding } from "@/lib/toornament-standings"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { TeamCompareCheckbox } from "@/components/team-compare-picker"
import { isNetlightTeam } from "@/components/netlight-flames"
import { FollowTeamButton } from "@/components/follow-team-button"
import { FollowIndicator } from "@/components/follow-indicator"

// Official Toornament standings row as rendered by the table: the live ranking
// plus the resolved SFL team (null when the name can't be matched confidently)
// and Faceit team stats pre-joined into plain, serializable fields.
export type TeamStandingTableRow = OfficialStanding & {
  teamId: number | null
  logoUrl: string | null
  faceitAvgElo: number | null
  faceitRecent: string
}

const rightAlign = { className: "text-right" }

export const teamStandingsColumns: ColumnDef<TeamStandingTableRow>[] = [
  {
    id: "follow",
    header: "Follow",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.teamId === null ? null : (
        <FollowTeamButton teamName={row.original.teamName} iconOnly />
      ),
  },
  {
    id: "compare",
    header: "",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.teamId === null ? null : (
        <TeamCompareCheckbox
          teamId={row.original.teamId}
          teamName={row.original.teamName}
        />
      ),
    meta: { className: "w-10" },
  },
  {
    accessorKey: "rank",
    header: "#",
    enableSorting: false,
    meta: { className: "w-10 text-muted-foreground" },
  },
  {
    accessorKey: "teamName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    meta: { className: "font-medium" },
    cell: ({ row }) => {
      const name = (
        <span
          className={
            isNetlightTeam(row.original.teamName)
              ? "netlight-name font-semibold"
              : ""
          }
        >
          {row.original.teamName}
        </span>
      )
      if (row.original.teamId === null) {
        return <span className="flex items-center gap-2">{name}</span>
      }
      return (
        <Link
          href={`/teams/team/${encodeURIComponent(row.original.teamName)}`}
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
          {name}
          <FollowIndicator teamId={row.original.teamId} />
        </Link>
      )
    },
  },
  {
    accessorKey: "played",
    header: ({ column }) => <DataTableColumnHeader column={column} title="P" />,
    meta: rightAlign,
  },
  {
    accessorKey: "wins",
    header: ({ column }) => <DataTableColumnHeader column={column} title="W" />,
    meta: rightAlign,
  },
  {
    accessorKey: "draws",
    header: ({ column }) => <DataTableColumnHeader column={column} title="D" />,
    meta: rightAlign,
  },
  {
    accessorKey: "losses",
    header: ({ column }) => <DataTableColumnHeader column={column} title="L" />,
    meta: rightAlign,
  },
  {
    accessorKey: "scoreDifference",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="+/-" />
    ),
    meta: rightAlign,
  },
  {
    accessorKey: "points",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pts" />
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

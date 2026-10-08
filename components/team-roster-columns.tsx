import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { TeamRosterPlayerRow } from "@/lib/db"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Badge } from "@/components/ui/badge"
import { RosterAccountEditor } from "@/components/roster-account-editor"
import { ProfileLinks } from "@/components/profile-links"
import { isNetlightTeam } from "@/components/netlight-flames"
import { FollowIndicator } from "@/components/follow-indicator"
import { RatingValue } from "@/components/player-rating"

// Roster row as rendered by the table: the raw DB row plus Faceit elo
// pre-joined into a plain, serializable field.
export type TeamRosterTableRow = TeamRosterPlayerRow & {
  faceitElo: number | null
  faceitNickname: string | null
}

const rightAlign = { className: "text-right" }

/**
 * Shared roster columns for both the single-team roster view (with an
 * Accounts column for correcting/viewing the steamID match) and the
 * side-by-side compare view (without it, since that view has no reason to
 * edit matches). `teamName` is only needed when `includeAccounts` is set,
 * for RosterAccountEditor's server action call.
 */
export function buildTeamRosterColumns({
  teamName,
  teamId,
  includeAccounts,
  linkNames = true,
}: {
  teamName?: string
  teamId?: number
  includeAccounts: boolean
  /** Turn off when the whole row already links to the player (avoids nested anchors). */
  linkNames?: boolean
}): ColumnDef<TeamRosterTableRow>[] {
  const columns: ColumnDef<TeamRosterTableRow>[] = [
    {
      accessorKey: "inGameName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Player" />
      ),
      meta: { className: "font-medium" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FollowIndicator teamId={teamId} />
          {row.original.steamid64 && linkNames ? (
            <Link
              href={`/players/${encodeURIComponent(row.original.steamid64)}`}
              className={`underline-offset-4 hover:underline ${isNetlightTeam(teamName) ? "netlight-name font-semibold" : ""}`}
            >
              {row.original.inGameName ?? row.original.nickname}
            </Link>
          ) : (
            <span
              className={
                isNetlightTeam(teamName) ? "netlight-name font-semibold" : ""
              }
            >
              {row.original.inGameName ?? row.original.nickname}
            </span>
          )}
          {row.original.matchStatus !== "manual" &&
          row.original.matchStatus !== "auto_high" ? (
            <Badge variant="outline" className="text-amber-600">
              {row.original.matchStatus === "auto_low"
                ? "low-confidence match"
                : row.original.matchStatus === "unmatched"
                  ? "unmatched"
                  : row.original.matchStatus}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "matchesPlayed",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Matches" />
      ),
      meta: rightAlign,
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
          ratedGames={row.original.ratedGames}
          matchesPlayed={row.original.matchesPlayed}
        />
      ),
    },
    {
      accessorKey: "kills",
      cell: ({ row }) =>
        row.original.matchesPlayed ? row.original.kills : "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="K" />
      ),
      meta: rightAlign,
    },
    {
      accessorKey: "deaths",
      cell: ({ row }) =>
        row.original.matchesPlayed ? row.original.deaths : "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="D" />
      ),
      meta: rightAlign,
    },
    {
      accessorKey: "assists",
      cell: ({ row }) =>
        row.original.matchesPlayed ? row.original.assists : "—",
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
      accessorKey: "faceitElo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Faceit Elo" />
      ),
      meta: rightAlign,
      cell: ({ row }) => row.original.faceitElo ?? "—",
    },
  ]

  if (includeAccounts) {
    columns.push({
      id: "accounts",
      header: "Accounts",
      enableSorting: false,
      meta: { className: "whitespace-normal" },
      cell: ({ row }) => (
        <div className="relative z-10 flex items-center gap-1.5">
          <ProfileLinks
            steamid64={row.original.steamid64}
            faceitNickname={row.original.faceitNickname}
          />
          {teamName ? (
            <RosterAccountEditor
              teamName={teamName}
              rosterEntryId={row.original.rosterEntryId}
              currentSteamid64={row.original.steamid64}
            />
          ) : null}
        </div>
      ),
    })
  }

  return columns
}

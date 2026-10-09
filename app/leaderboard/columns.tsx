import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { LeaderboardRow, LeaderboardStat } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { ProfileLinks } from "@/components/profile-links"
import { isNetlightTeam } from "@/components/netlight-flames"
import { FollowIndicator } from "@/components/follow-indicator"
import { RatingValue } from "@/components/player-rating"

// The leaderboard row shape as rendered by the table: the raw DB row plus
// Faceit stats pre-joined into plain, serializable fields (the lookup Map
// built server-side in page.tsx isn't itself passed across the server/
// client boundary).
export type LeaderboardTableRow = LeaderboardRow & {
  faceitElo: number | null
  faceitNickname: string | null
  faceitRecent: string
  avatarUrl: string | null
}

// Mirrors lib/db.ts's STAT_COLUMNS: kills/deaths/assists are shown (and
// sorted) as per-match averages, matching the "Avg K"/"Avg D"/"Avg A"
// columns rather than career totals.
function statValueFor(stat: LeaderboardStat, row: LeaderboardTableRow): number {
  switch (stat) {
    case "matches":
      return row.matchesPlayed
    case "kills":
      return row.matchesPlayed > 0 ? row.kills / row.matchesPlayed : 0
    case "deaths":
      return row.matchesPlayed > 0 ? row.deaths / row.matchesPlayed : 0
    case "assists":
      return row.matchesPlayed > 0 ? row.assists / row.matchesPlayed : 0
    case "adr":
      return row.adr ?? 0
    case "hs_pct":
      return row.hsPct ?? 0
    case "mvps":
      return row.mvps
    case "rating":
      return row.rating ?? 0
  }
}

function formatStat(stat: LeaderboardStat, value: number): string {
  if (stat === "rating") return value.toFixed(2)
  if (stat === "hs_pct") return `${(value * 100).toFixed(1)}%`
  if (
    stat === "adr" ||
    stat === "kills" ||
    stat === "deaths" ||
    stat === "assists"
  )
    return value.toFixed(1)
  return String(Math.round(value))
}

const rightAlign = { className: "text-right" }

// Columns dropped by the compact variant (e.g. the home page preview).
const COMPACT_HIDDEN = new Set([
  "teamName",
  "matchesPlayed",
  "assists",
  "hsPct",
  "statValue",
  "faceitElo",
  "faceitRecent",
])

export function buildLeaderboardColumns(
  stat: LeaderboardStat,
  statLabel: string | undefined,
  compact = false
): ColumnDef<LeaderboardTableRow>[] {
  const columns: ColumnDef<LeaderboardTableRow>[] = [
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
          <FollowIndicator teamId={row.original.teamId} />
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
          <div className="flex flex-col">
            <Link
              href={`/players/${encodeURIComponent(row.original.steamid64)}`}
              className={`underline-offset-4 hover:underline ${isNetlightTeam(row.original.teamName) ? "netlight-name font-semibold" : ""}`}
            >
              {row.original.inGameName}
            </Link>
            <span className="text-xs text-muted-foreground">
              {row.original.realName ?? "😂"}
            </span>
          </div>
          {compact ? null : (
            <ProfileLinks
              steamid64={row.original.steamid64}
              faceitNickname={row.original.faceitNickname}
            />
          )}
          {!compact &&
          row.original.matchStatus &&
          row.original.matchStatus !== "manual" &&
          row.original.matchStatus !== "auto_high" ? (
            <Badge variant="outline" className="text-amber-600">
              {row.original.matchStatus === "auto_low"
                ? "low-confidence match"
                : row.original.matchStatus}
            </Badge>
          ) : null}
          {!compact && !row.original.teamName ? (
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
      cell: ({ row }) =>
        isNetlightTeam(row.original.teamName) ? (
          <span className="netlight-name font-semibold">
            {row.original.teamName}
          </span>
        ) : (
          (row.original.teamName ?? "—")
        ),
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
          teamName={row.original.teamName}
        />
      ),
    },
    {
      id: "kills",
      accessorFn: (row) => statValueFor("kills", row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Avg K" />
      ),
      meta: rightAlign,
      cell: ({ row }) =>
        row.original.matchesPlayed > 0
          ? (row.original.kills / row.original.matchesPlayed).toFixed(1)
          : "—",
    },
    {
      id: "deaths",
      accessorFn: (row) => statValueFor("deaths", row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Avg D" />
      ),
      meta: rightAlign,
      cell: ({ row }) =>
        row.original.matchesPlayed > 0
          ? (row.original.deaths / row.original.matchesPlayed).toFixed(1)
          : "—",
    },
    {
      id: "assists",
      accessorFn: (row) => statValueFor("assists", row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Avg A" />
      ),
      meta: rightAlign,
      cell: ({ row }) =>
        row.original.matchesPlayed > 0
          ? (row.original.assists / row.original.matchesPlayed).toFixed(1)
          : "—",
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
      id: "statValue",
      accessorFn: (row) =>
        stat === "rating" && row.rating == null
          ? undefined
          : statValueFor(stat, row),
      sortUndefined: "last",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={statLabel ?? "Stat"} />
      ),
      meta: { className: "text-right font-medium" },
      cell: ({ row }) =>
        stat === "rating" ? (
          <RatingValue
            rating={row.original.rating}
            ratedGames={row.original.ratedGames}
            matchesPlayed={row.original.matchesPlayed}
            teamName={row.original.teamName}
          />
        ) : (
          formatStat(stat, statValueFor(stat, row.original))
        ),
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
  return compact
    ? columns.filter((c) => {
        const key = c.id ?? ("accessorKey" in c ? String(c.accessorKey) : "")
        return !COMPACT_HIDDEN.has(key)
      })
    : columns
}

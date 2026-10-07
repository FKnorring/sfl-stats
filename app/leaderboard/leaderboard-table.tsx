"use client"

import * as React from "react"
import { DataTable } from "@/components/data-table/data-table"
import { buildLeaderboardColumns, type LeaderboardTableRow } from "./columns"
import { isNetlightTeam } from "@/components/netlight-flames"
import type { LeaderboardStat } from "@/lib/db"
import { useFollowRowClass } from "@/components/follow-indicator"

// Thin client wrapper around DataTable: column defs contain functions
// (header/cell renderers), so they can't be built in the Server Component
// page and passed down as a prop — they have to be constructed here, on
// the client side of the boundary, from the plain serializable `rows` the
// page passes in.
export function LeaderboardTable({
  rows,
  stat,
  statLabel,
  compact = false,
}: {
  rows: LeaderboardTableRow[]
  stat: LeaderboardStat
  statLabel: string | undefined
  compact?: boolean
}) {
  const rowClass = useFollowRowClass()
  const columns = React.useMemo(
    () => buildLeaderboardColumns(stat, statLabel, compact),
    [stat, statLabel, compact]
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      globalFilterPlaceholder={compact ? undefined : "Search players…"}
      getRowHref={(r) => `/players/${encodeURIComponent(r.steamid64)}`}
      getRowPlayerId={(r) => r.steamid64}
      getRowClassName={(r) =>
        rowClass(r.teamId) ??
        (isNetlightTeam(r.teamName) ? "netlight-row" : undefined)
      }
      tableClassName={
        compact ? "[&_td]:px-1 [&_td]:py-1 [&_th]:h-8 [&_th]:px-1" : undefined
      }
      emptyMessage="No matches found for this filter combination."
    />
  )
}

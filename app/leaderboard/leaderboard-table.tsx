"use client"

import * as React from "react"
import { DataTable } from "@/components/data-table/data-table"
import { buildLeaderboardColumns, type LeaderboardTableRow } from "./columns"
import { isNetlightTeam } from "@/components/netlight-flames"
import type { LeaderboardStat } from "@/lib/db"

// Thin client wrapper around DataTable: column defs contain functions
// (header/cell renderers), so they can't be built in the Server Component
// page and passed down as a prop — they have to be constructed here, on
// the client side of the boundary, from the plain serializable `rows` the
// page passes in.
export function LeaderboardTable({
  rows,
  stat,
  statLabel,
}: {
  rows: LeaderboardTableRow[]
  stat: LeaderboardStat
  statLabel: string | undefined
}) {
  const columns = React.useMemo(
    () => buildLeaderboardColumns(stat, statLabel),
    [stat, statLabel]
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      globalFilterPlaceholder="Search players…"
      getRowClassName={(r) =>
        isNetlightTeam(r.teamName) ? "netlight-row" : undefined
      }
      emptyMessage="No matches found for this filter combination."
    />
  )
}

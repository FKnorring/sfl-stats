"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import {
  FollowIndicator,
  useFollowRowClass,
} from "@/components/follow-indicator"
import type { LiveStandingsResult } from "@/lib/toornament-live"

type Row = LiveStandingsResult["rows"][number]

export function OfficialDivisionTable({
  rows,
  teamId,
}: {
  rows: Row[]
  teamId: number
}) {
  const rowClass = useFollowRowClass()
  const columns: ColumnDef<Row>[] = [
    { accessorKey: "rank", header: "Rank" },
    {
      accessorKey: "teamName",
      header: "Team",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{row.original.teamName}</span>
          <FollowIndicator teamId={row.original.teamId} />
          {row.original.teamId === teamId ? (
            <span className="rounded border border-border px-1.5 text-xs font-medium">
              Selected team
            </span>
          ) : null}
        </div>
      ),
    },
    ...(
      [
        "played",
        "wins",
        "draws",
        "losses",
        "scoreDifference",
        "points",
      ] as const
    ).map((key) => ({
      accessorKey: key,
      header: ({
        column,
      }: {
        column: import("@tanstack/react-table").Column<Row>
      }) => (
        <DataTableColumnHeader
          column={column}
          title={
            {
              played: "P",
              wins: "W",
              draws: "D",
              losses: "L",
              scoreDifference: "+/-",
              points: "Pts",
            }[key]
          }
        />
      ),
      meta: { className: "text-right" },
    })),
  ]
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowClassName={(row) =>
        [
          rowClass(row.teamId),
          row.teamId === teamId
            ? "outline outline-1 -outline-offset-1 outline-foreground"
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    />
  )
}

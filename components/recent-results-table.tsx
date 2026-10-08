"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { followHref } from "@/lib/followed-teams"
import {
  FollowIndicator,
  useFollowRowClass,
} from "@/components/follow-indicator"

export type RecentResultRow = {
  matchId: string
  date: string
  dateSort: number
  teamAName: string
  teamAId: number | null
  teamBName: string
  teamBId: number | null
  score: string
  division: string
}

function TeamCell({ name, teamId }: { name: string; teamId: number | null }) {
  return (
    <div className="flex items-center gap-2">
      {teamId !== null ? (
        <Link href={followHref(name)} className="hover:underline">
          {name}
        </Link>
      ) : (
        name
      )}
      <FollowIndicator teamId={teamId} />
    </div>
  )
}

const columns: ColumnDef<RecentResultRow>[] = [
  {
    accessorKey: "dateSort",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => row.original.date,
  },
  {
    accessorKey: "teamAName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team A" />
    ),
    cell: ({ row }) => (
      <TeamCell name={row.original.teamAName} teamId={row.original.teamAId} />
    ),
  },
  {
    accessorKey: "score",
    header: "Score",
    enableSorting: false,
    meta: { className: "text-center tabular-nums" },
  },
  {
    accessorKey: "teamBName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team B" />
    ),
    cell: ({ row }) => (
      <TeamCell name={row.original.teamBName} teamId={row.original.teamBId} />
    ),
  },
]

export function RecentResultsTable({ rows }: { rows: RecentResultRow[] }) {
  const rowClass = useFollowRowClass()
  return (
    <DataTable
      columns={columns}
      data={rows}
      tableClassName="[&_td]:px-1 [&_td]:py-1 [&_th]:h-8 [&_th]:px-1"
      getRowClassName={(row) => rowClass(row.teamAId) ?? rowClass(row.teamBId)}
      emptyMessage="No official results yet."
    />
  )
}

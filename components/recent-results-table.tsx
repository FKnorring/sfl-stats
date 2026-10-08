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
  teamALogoUrl: string | null
  teamBName: string
  teamBId: number | null
  teamBLogoUrl: string | null
  score: string
  division: string
}

function TeamLogo({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- small, variable-source external team logos
    <img src={url} alt="" className="size-6 shrink-0 rounded object-contain" />
  ) : (
    <div className="size-6 shrink-0" />
  )
}

function TeamCell({
  name,
  teamId,
  logoUrl,
  logoSide,
}: {
  name: string
  teamId: number | null
  logoUrl: string | null
  logoSide: "left" | "right"
}) {
  return (
    <div className="flex items-center gap-2">
      {logoSide === "left" ? <TeamLogo url={logoUrl} /> : null}
      {teamId !== null ? (
        <Link href={followHref(name)} className="hover:underline">
          {name}
        </Link>
      ) : (
        name
      )}
      <FollowIndicator teamId={teamId} />
      {logoSide === "right" ? <TeamLogo url={logoUrl} /> : null}
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
      <TeamCell
        name={row.original.teamAName}
        teamId={row.original.teamAId}
        logoUrl={row.original.teamALogoUrl}
        logoSide="left"
      />
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
      <TeamCell
        name={row.original.teamBName}
        teamId={row.original.teamBId}
        logoUrl={row.original.teamBLogoUrl}
        logoSide="right"
      />
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

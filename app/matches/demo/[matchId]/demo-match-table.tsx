"use client"

import { DataTable } from "@/components/data-table/data-table"
import { demoMatchPlayerColumns, type DemoMatchPlayerRow } from "./columns"

// Thin client wrapper, same reasoning as the other */*-table.tsx files:
// column defs contain function values, so they're built here on the
// client side rather than in the Server Component page and passed down
// as a prop.
export function DemoMatchTable({ rows }: { rows: DemoMatchPlayerRow[] }) {
  return (
    <DataTable
      columns={demoMatchPlayerColumns}
      data={rows}
      emptyMessage="No player stats found for this match."
    />
  )
}

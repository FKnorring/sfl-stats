"use client"

import * as React from "react"
import Link from "next/link"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { PlayerHoverCard } from "@/components/player-hover-card"

// Lets a column opt into alignment/width classes applied to both its header
// and cells, e.g. `meta: { className: "text-right" }` for numeric columns.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- module augmentation must match ColumnMeta's original type params even though this merge doesn't use them
  interface ColumnMeta<TData, TValue> {
    className?: string
  }
}

/**
 * Generic sortable/searchable table built on the shadcn `Table` primitive.
 * Pages fetch and shape their own `data`, define `columns` once (see
 * `app/leaderboard/columns.tsx` for a representative example), and render:
 *
 *   <DataTable columns={columns} data={rows} globalFilterPlaceholder="Search players…" />
 *
 * Column sorting here is purely client-side, re-ordering whatever rows were
 * passed in — it's independent of any server-side filtering/sorting a page
 * already does to decide which rows to fetch in the first place.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = "No results found.",
  globalFilterPlaceholder,
  getRowHref,
  getRowPlayerId,
  getRowClassName,
  tableClassName,
  onRowClick,
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyMessage?: string
  globalFilterPlaceholder?: string
  getRowHref?: (row: TData) => string | null
  /** Steam ID of the player a row represents; shows the player hover card over the whole row. */
  getRowPlayerId?: (row: TData) => string | null
  getRowClassName?: (row: TData) => string | undefined
  tableClassName?: string
  onRowClick?: (row: TData) => void
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-3">
      {globalFilterPlaceholder ? (
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={globalFilterPlaceholder}
          className="max-w-sm"
        />
      ) : null}
      <Table className={tableClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.className}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => {
              const href = getRowHref?.(row.original)
              const playerId = getRowPlayerId?.(row.original)
              const tableRow = (
                <TableRow
                  key={playerId ? undefined : row.id}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onRowClick(row.original)
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={
                    [
                      href ? "relative" : undefined,
                      onRowClick ? "cursor-pointer" : undefined,
                      getRowClassName?.(row.original),
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.columnDef.meta?.className}
                    >
                      {href && index === 0 ? (
                        // Stretched link: the ::after covers the whole <tr>.
                        <Link
                          href={href}
                          className="after:absolute after:inset-0"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </Link>
                      ) : (
                        flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
              return playerId ? (
                <PlayerHoverCard key={row.id} steamid64={playerId}>
                  {tableRow}
                </PlayerHoverCard>
              ) : (
                tableRow
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

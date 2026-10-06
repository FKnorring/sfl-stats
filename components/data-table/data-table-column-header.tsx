"use client"

import type { Column } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

/**
 * Sortable column header: a plain label when the column can't be sorted,
 * otherwise a button that toggles ascending/descending/unsorted and shows
 * the current direction. Pass as a column's `header` renderer:
 *
 *   header: ({ column }) => (
 *     <DataTableColumnHeader column={column} title="Kills" />
 *   )
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }

  const sorted = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2.5 h-7 gap-1 px-2.5", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : (
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  )
}

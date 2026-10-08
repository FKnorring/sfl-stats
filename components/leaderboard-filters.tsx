"use client"

import * as React from "react"
import { Checkbox } from "@base-ui/react/checkbox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Controlled division <Select>. "" means all divisions. The parent owns the
 * value and filters the already-loaded rows, so no URL update or refetch.
 */
export function DivisionFilter({
  divisions,
  value,
  onValueChange,
}: {
  divisions: string[]
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="leaderboard-division" className="text-sm font-medium">
        Division
      </label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next)
        }}
      >
        <SelectTrigger id="leaderboard-division" className="min-h-11 min-w-44">
          <SelectValue>{value || "All divisions"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="" className="min-h-11">
            All divisions
          </SelectItem>
          {divisions.map((division) => (
            <SelectItem key={division} value={division} className="min-h-11">
              {division}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Checkbox-based team multiselect in a disclosure. Each checkbox is a
 * Base UI Checkbox, so keyboard and screen-reader behaviour comes from the
 * primitive. An empty selection means "all teams" in the current scope.
 */
export function TeamMultiselect({
  teams,
  selectedIds,
  onChange,
}: {
  teams: { teamId: number; teamName: string }[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  const selectedNames = teams
    .filter((team) => selectedIds.includes(team.teamId))
    .map((team) => team.teamName)

  const summary =
    selectedIds.length === 0
      ? "All teams"
      : selectedIds.length === 1
        ? (selectedNames[0] ?? "1 team")
        : `${selectedIds.length} teams`

  function setChecked(teamId: number, checked: boolean) {
    onChange(
      checked
        ? [...selectedIds, teamId]
        : selectedIds.filter((id) => id !== teamId)
    )
  }

  return (
    <div className="relative flex flex-col gap-2">
      <span className="text-sm font-medium">Teams</span>
      <details className="group">
        <summary className="flex min-h-11 min-w-56 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="truncate">{summary}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="absolute z-50 mt-1 flex max-h-72 w-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => onChange([])}
            >
              Clear teams
            </Button>
          </div>
          {teams.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              No teams in this division.
            </p>
          ) : (
            teams.map((team) => (
              <label
                key={team.teamId}
                className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
              >
                <Checkbox.Root
                  checked={selectedIds.includes(team.teamId)}
                  onCheckedChange={(checked: boolean) =>
                    setChecked(team.teamId, checked)
                  }
                  className="flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
                >
                  <Checkbox.Indicator>
                    <CheckIcon className="size-3.5" />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <span className="truncate">{team.teamName}</span>
              </label>
            ))
          )}
        </div>
      </details>
    </div>
  )
}

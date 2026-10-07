"use client"

import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { CalendarDaysIcon, SearchIcon } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatMapName } from "@/lib/map-images"
import {
  FollowIndicator,
  useFollowRowClass,
} from "@/components/follow-indicator"
import {
  formatMatchDate,
  matchDateTime,
  matchesFilters,
  type DemoMatchRow,
  type UpcomingMatchRow,
} from "@/lib/matches"

function divisionLabel(match: DemoMatchRow) {
  return (
    [
      ...new Set([match.teamADivision, match.teamBDivision].filter(Boolean)),
    ].join(" / ") || "Unknown division"
  )
}

const columns: ColumnDef<DemoMatchRow>[] = [
  {
    id: "demoDate",
    accessorFn: (match) => matchDateTime(match.demoDate),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => formatMatchDate(row.original.demoDate),
  },
  {
    accessorKey: "mapName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Map" />
    ),
    cell: ({ row }) => formatMapName(row.original.mapName) ?? "Unknown map",
  },
  {
    accessorKey: "teamAName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team A" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.teamAName ?? "Unknown team"}
        <FollowIndicator teamId={row.original.teamAId} />
      </div>
    ),
  },
  {
    accessorKey: "teamAScore",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Demo score" />
    ),
    meta: { className: "text-center tabular-nums" },
    cell: ({ row }) => {
      const match = row.original
      return match.teamAScore !== null && match.teamBScore !== null
        ? `${match.teamAScore}-${match.teamBScore}`
        : "-"
    },
  },
  {
    accessorKey: "teamBName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team B" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.teamBName ?? "Unknown team"}
        <FollowIndicator teamId={row.original.teamBId} />
      </div>
    ),
  },
  {
    id: "division",
    accessorFn: divisionLabel,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Division" />
    ),
    cell: ({ row }) => divisionLabel(row.original),
  },
]

export function MatchesView({
  history,
  upcoming,
  divisions,
}: {
  history: DemoMatchRow[]
  upcoming: UpcomingMatchRow[] | null
  divisions: string[]
}) {
  const rowClass = useFollowRowClass()
  const [division, setDivision] = useState("")
  const [search, setSearch] = useState("")
  const filteredHistory = history.filter((match) =>
    matchesFilters(match, division, search)
  )
  const filteredUpcoming = upcoming?.filter((match) =>
    matchesFilters(match, division, search)
  )

  return (
    <div className="flex min-h-svh min-w-0 flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Matches</h1>
        <p className="text-sm text-muted-foreground">
          The next fixtures. The demos behind the results.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="matches-division" className="text-sm font-medium">
            Division
          </label>
          <Select
            value={division}
            onValueChange={(value) => {
              if (value !== null) setDivision(value)
            }}
          >
            <SelectTrigger id="matches-division" className="min-h-11 min-w-44">
              <SelectValue>{division || "All divisions"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="min-h-11">
                All divisions
              </SelectItem>
              {divisions.map((item) => (
                <SelectItem key={item} value={item} className="min-h-11">
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <label htmlFor="matches-search" className="text-sm font-medium">
            Search by team
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
            />
            <Input
              id="matches-search"
              type="search"
              placeholder="Either team name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 pl-9 text-base"
            />
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!division && !search}
          onClick={() => {
            setDivision("")
            setSearch("")
          }}
        >
          Clear filters
        </Button>
      </div>

      <p role="status" className="sr-only">
        {filteredUpcoming?.length ?? 0} upcoming matches and{" "}
        {filteredHistory.length} demo matches shown.
      </p>

      <section aria-labelledby="upcoming-heading" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="upcoming-heading" className="font-heading font-medium">
            Upcoming matches
          </h2>
          {filteredUpcoming ? (
            <Badge variant="secondary">{filteredUpcoming.length}</Badge>
          ) : null}
          <span className="text-xs text-muted-foreground sm:ml-auto">
            Live Toornament schedule / five-minute cache
          </span>
        </div>
        {filteredUpcoming === undefined ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Couldn&apos;t reach Toornament right now. Demo history is still
            available below.
          </p>
        ) : filteredUpcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {upcoming?.length
              ? "No upcoming matches for these filters."
              : "No upcoming matches scheduled."}
          </p>
        ) : (
          <div
            role="region"
            aria-label="Upcoming matches, horizontally scrollable"
            tabIndex={0}
            className="flex max-w-full gap-3 overflow-x-auto rounded-lg pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {filteredUpcoming.map((match) => (
              <article
                key={match.matchId}
                className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border border-border bg-popover p-4 shadow-xs"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDaysIcon aria-hidden="true" className="size-4" />
                  <span>{formatMatchDate(match.scheduledAt, true)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium wrap-break-word">
                    {match.teamAName}
                    <FollowIndicator teamId={match.teamAId} />
                  </span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-medium wrap-break-word">
                    {match.teamBName}
                    <FollowIndicator teamId={match.teamBId} />
                  </span>
                </div>
                <span className="mt-auto text-xs text-muted-foreground">
                  {[
                    ...new Set(
                      [match.teamADivision, match.teamBDivision].filter(Boolean)
                    ),
                  ].join(" / ") || "Unknown division"}
                </span>
              </article>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Times shown in Stockholm time.
        </p>
      </section>

      <section aria-labelledby="history-heading" className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="history-heading" className="font-heading font-medium">
            Match history
          </h2>
          <Badge variant="secondary">{filteredHistory.length}</Badge>
        </div>
        <DataTable
          columns={columns}
          data={filteredHistory}
          getRowClassName={(row) =>
            rowClass(row.teamAId) ?? rowClass(row.teamBId)
          }
          emptyMessage={
            history.length
              ? "No demo matches for these filters."
              : "No ingested demo matches yet."
          }
          getRowHref={(match) => `/matches/demo/${match.matchId}`}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          One row per ingested demo. Scores come from the demo, not the official
          series result.
        </p>
      </section>
    </div>
  )
}

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { TeamMeta } from "@/lib/db"
import {
  DivisionFilter,
  TeamMultiselect,
} from "@/components/leaderboard-filters"
import { LeaderboardTable } from "./leaderboard-table"
import type { LeaderboardTableRow } from "./columns"

/**
 * Filters the complete current-season leaderboard in the browser. Division
 * and team selections combine conjunctively; several selected teams match
 * as OR. With no team selected, every team in the division is included.
 */
export function LeaderboardView({
  rows,
  teams,
}: {
  rows: LeaderboardTableRow[]
  teams: TeamMeta[]
}) {
  const [division, setDivision] = useState("")
  const [teamIds, setTeamIds] = useState<number[]>([])

  const divisions = useMemo(
    () => [...new Set(teams.map((team) => team.division))].sort(),
    [teams]
  )

  const divisionTeams = useMemo(
    () => teams.filter((team) => !division || team.division === division),
    [teams, division]
  )

  const filteredRows = useMemo(() => {
    const allowedTeamIds = new Set(
      teamIds.length > 0 ? teamIds : divisionTeams.map((team) => team.teamId)
    )
    return rows.filter((row) => {
      if (division && row.division !== division) return false
      if (division || teamIds.length > 0) {
        return row.teamId !== null && allowedTeamIds.has(row.teamId)
      }
      return true
    })
  }, [rows, division, teamIds, divisionTeams])

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <DivisionFilter
          divisions={divisions}
          value={division}
          onValueChange={(next) => {
            setDivision(next)
            setTeamIds([])
          }}
        />
        <TeamMultiselect
          teams={divisionTeams}
          selectedIds={teamIds}
          onChange={setTeamIds}
        />
        <Link
          href="/teams"
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View team standings →
        </Link>
      </div>

      <p role="status" className="sr-only">
        {filteredRows.length} players shown.
      </p>

      <LeaderboardTable rows={filteredRows} stat="kills" statLabel="Kills" />
    </>
  )
}

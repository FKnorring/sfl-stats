"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type TeamOption = { teamId: number; label: string }

/**
 * One query-param-backed <Select> for picking a specific team-season (by
 * teamId, not name — same reasoning as getTeamStandings/getTeamRoster).
 * Mirrors FilterSelect in leaderboard-filters.tsx, but with no "all" option
 * since a slot on the compare page always needs a team.
 */
export function TeamSelect({
  paramName,
  placeholder,
  teams,
  value,
}: {
  paramName: "teamA" | "teamB"
  placeholder: string
  teams: TeamOption[]
  value?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(next: string | null) {
    if (next === null) return
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, next)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select
      value={value != null ? String(value) : null}
      onValueChange={handleChange}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {teams.map((t) => (
          <SelectItem key={t.teamId} value={String(t.teamId)}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

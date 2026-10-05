"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Option = { value: string; label: string }

/**
 * One query-param-backed <Select>. Changing it replaces that single param
 * in the URL (keeping the others), which re-triggers the Server Component
 * page with new searchParams — no client-side data fetching needed.
 */
function FilterSelect({
  paramName,
  placeholder,
  options,
  value,
}: {
  paramName: string
  placeholder: string
  options: Option[]
  value?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(next: string | null) {
    if (next === null) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === "all") {
      params.delete(paramName)
    } else {
      params.set(paramName, next)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select value={value ?? "all"} onValueChange={handleChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SeasonFilter({
  seasons,
  value,
}: {
  seasons: string[]
  value?: string
}) {
  return (
    <FilterSelect
      paramName="season"
      placeholder="Seasons"
      value={value}
      options={seasons.map((s) => ({ value: s, label: s }))}
    />
  )
}

export function DivisionFilter({
  divisions,
  value,
}: {
  divisions: string[]
  value?: string
}) {
  return (
    <FilterSelect
      paramName="division"
      placeholder="Divisions"
      value={value}
      options={divisions.map((d) => ({ value: d, label: d }))}
    />
  )
}

export function TeamFilter({
  teams,
  value,
}: {
  teams: string[]
  value?: string
}) {
  return (
    <FilterSelect
      paramName="team"
      placeholder="Teams"
      value={value}
      options={teams.map((t) => ({ value: t, label: t }))}
    />
  )
}

export function StatFilter({
  stats,
  value,
}: {
  stats: Option[]
  value: string
}) {
  return (
    <FilterSelect
      paramName="stat"
      placeholder="Stat"
      value={value}
      options={stats}
    />
  )
}

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { getDivisions } from "@/lib/cached-data"

export default function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    division?: string | string[]
    season?: string | string[]
  }>
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3 p-6" aria-busy="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
      }
    >
      <TeamRedirect searchParams={searchParams} />
    </Suspense>
  )
}

async function TeamRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    division?: string | string[]
    season?: string | string[]
  }>
}) {
  const divisions = await getDivisions()
  if (!divisions.length) {
    return <p className="p-6 text-sm text-muted-foreground">No teams found.</p>
  }

  const query = await searchParams
  const requested = Array.isArray(query.division)
    ? query.division[0]
    : query.division
  const division =
    requested && divisions.includes(requested) ? requested : divisions[0]
  const season = Array.isArray(query.season) ? query.season[0] : query.season
  const params = new URLSearchParams()
  if (season !== undefined) params.set("season", season)
  const suffix = params.size ? `?${params}` : ""
  redirect(`/teams/${encodeURIComponent(division)}${suffix}`)
}

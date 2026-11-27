import type { Metadata } from "next"
import { getCurrentSeason, getMatchTeams } from "@/lib/cache/cached-data"
import { getLivePlayoffBracket } from "@/lib/cache/cached-toornament"
import { resolveOfficialTeam } from "@/lib/toornament/standings"
import { BracketView } from "./bracket-view"

export const metadata: Metadata = { title: "Playoffs" }

export default async function BracketPage() {
  const [live, teams] = await Promise.all([
    getLivePlayoffBracket().catch((error) => {
      console.error("[toornament] Could not load playoff bracket:", error)
      return undefined
    }),
    getCurrentSeason().then((season) => (season ? getMatchTeams(season) : [])),
  ])

  if (live === undefined)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Toornament&apos;s bracket is unreachable right now. Try again shortly.
      </p>
    )
  if (live === null)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No playoff bracket has been published for this season yet.
      </p>
    )

  // Link only the teams we can confidently map to a roster entry.
  const teamNames: Record<string, string> = {}
  for (const match of live.bracket.matches)
    for (const slot of [match.teamA, match.teamB]) {
      if (!slot.name || slot.name in teamNames) continue
      const team = resolveOfficialTeam(slot.name, teams)
      if (team) teamNames[slot.name] = team.teamName
    }

  return (
    <BracketView
      season={live.season}
      sourceUrl={live.sourceUrl}
      bracket={live.bracket}
      teamNames={teamNames}
    />
  )
}

import type { Metadata } from "next"
import {
  getCurrentSeason,
  getFaceitPlayerStats,
  getMatchTeams,
  getTeamLineup,
} from "@/lib/cache/cached-data"
import { getLivePlayoffBracket } from "@/lib/cache/cached-toornament"
import { getPlayerSummaries } from "@/lib/steam-client"
import { ASSUMED_ADVANCERS } from "@/lib/lineup"
import { applyAdvancers, previewMatches } from "@/lib/toornament/bracket"
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

  // Toornament lags behind results we know about; apply them locally.
  const bracket = applyAdvancers(live.bracket, ASSUMED_ADVANCERS)

  // Link only the teams we can confidently map to a roster entry.
  const resolved = new Map<string, { teamId: number; teamName: string }>()
  for (const match of bracket.matches)
    for (const slot of [match.teamA, match.teamB]) {
      if (!slot.name || resolved.has(slot.name)) continue
      const team = resolveOfficialTeam(slot.name, teams)
      if (team) resolved.set(slot.name, team)
    }
  const teamNames: Record<string, string> = {}
  for (const [name, team] of resolved) teamNames[name] = team.teamName

  const previews = previewMatches(bracket)
  const previewNames = new Set(
    previews.flatMap(({ sides }) =>
      sides.flatMap((side) =>
        side.kind === "team"
          ? [side.name]
          : side.kind === "candidates"
            ? side.names
            : []
      )
    )
  )
  const lineups = await Promise.all(
    [...previewNames].flatMap((name) => {
      const team = resolved.get(name)
      return team ? [getTeamLineup(team.teamId, team.teamName)] : []
    })
  )
  const lineupByName: Record<string, (typeof lineups)[number]> = {}
  for (const [name, team] of resolved) {
    const lineup = lineups.find((l) => l.teamId === team.teamId)
    if (lineup && previewNames.has(name)) lineupByName[name] = lineup
  }

  const lineupSteamids = lineups.flatMap((l) =>
    l.players.flatMap((p) => (p.steamid64 ? [p.steamid64] : []))
  )
  const [avatars, faceitStats] = await Promise.all([
    getPlayerSummaries(lineupSteamids),
    getFaceitPlayerStats(7, lineupSteamids),
  ])
  const faceit: Record<string, { elo: number | null; level: number | null }> =
    {}
  for (const [steamid, stats] of faceitStats)
    faceit[steamid] = { elo: stats.elo, level: stats.skillLevel }
  const avatarUrls: Record<string, string> = {}
  for (const [steamid, summary] of avatars)
    if (summary.avatarUrl) avatarUrls[steamid] = summary.avatarUrl

  return (
    <BracketView
      season={live.season}
      sourceUrl={live.sourceUrl}
      bracket={bracket}
      teamNames={teamNames}
      previews={previews}
      lineups={lineupByName}
      avatarUrls={avatarUrls}
      faceit={faceit}
    />
  )
}

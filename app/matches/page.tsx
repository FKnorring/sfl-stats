import {
  getCurrentSeason,
  getCurrentTeamCatalog,
  getDemoMatches,
  getMatchTeams,
} from "@/lib/cached-data"
import { enrichUpcomingMatches } from "@/lib/toornament-live"
import { getLivePendingMatches } from "@/lib/cached-toornament"
import { MatchesView } from "./matches-view"

export default async function MatchesPage() {
  const [history, live, teams, catalog] = await Promise.all([
    getDemoMatches(),
    getLivePendingMatches(),
    getCurrentSeason().then((season) => (season ? getMatchTeams(season) : [])),
    getCurrentTeamCatalog(),
  ])
  const divisions = [
    ...new Set([
      ...teams.map((team) => team.division),
      ...history.flatMap((match) =>
        [match.teamADivision, match.teamBDivision].filter(
          (division): division is string => division !== null
        )
      ),
    ]),
  ].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true }))

  const logos: Record<number, string> = {}
  for (const team of catalog)
    if (team.logoUrl) logos[team.teamId] = team.logoUrl

  return (
    <MatchesView
      history={history}
      upcoming={live === null ? null : enrichUpcomingMatches(live, teams)}
      divisions={divisions}
      logos={logos}
    />
  )
}

import {
  getCurrentSeason,
  getDemoMatches,
  getMatchTeams,
} from "@/lib/cached-data"
import { enrichUpcomingMatches } from "@/lib/toornament-live"
import { getLivePendingMatches } from "@/lib/cached-toornament"
import { MatchesView } from "./matches-view"

export default async function MatchesPage() {
  const [history, live, season] = await Promise.all([
    getDemoMatches(),
    getLivePendingMatches(),
    getCurrentSeason(),
  ])
  const teams = season ? await getMatchTeams(season) : []
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

  return (
    <MatchesView
      history={history}
      upcoming={live === null ? null : enrichUpcomingMatches(live, teams)}
      divisions={divisions}
    />
  )
}

export type MatchTeam = {
  teamId: number
  teamName: string
  season: string
  division: string
}

export type MatchTeams = {
  teamAName: string | null
  teamBName: string | null
  teamADivision: string | null
  teamBDivision: string | null
  teamARawName?: string
  teamBRawName?: string
}

export type DemoMatchRow = MatchTeams & {
  matchId: number
  mapName: string | null
  demoDate: string | null
  teamAScore: number | null
  teamBScore: number | null
}

export type UpcomingMatchRow = MatchTeams & {
  matchId: string
  scheduledAt: string | null
}

export function matchesFilters(
  match: MatchTeams,
  division: string,
  search: string
): boolean {
  const query = search.trim().toLocaleLowerCase("en-GB")
  return (
    (!division ||
      match.teamADivision === division ||
      match.teamBDivision === division) &&
    (!query ||
      [
        match.teamAName,
        match.teamBName,
        match.teamARawName,
        match.teamBRawName,
      ].some((name) => name?.toLocaleLowerCase("en-GB").includes(query)))
  )
}

export function matchDateTime(iso: string | null): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isFinite(time) ? time : null
}

export function formatMatchDate(iso: string | null, upcoming = false): string {
  const time = matchDateTime(iso)
  if (time === null) return upcoming ? "TBD" : "Unknown date"
  return new Date(time).toLocaleString("en-GB", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
    ...(upcoming
      ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric" }),
  })
}

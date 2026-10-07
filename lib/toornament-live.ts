import {
  parseScheduleWidget,
  type ScheduledMatch,
} from "@/lib/toornament-schedule"
import {
  MATCH_THRESHOLD_HIGH,
  normalizeName,
  scoreSimilarity,
} from "@/lib/matching"
import {
  matchDateTime,
  type MatchTeam,
  type UpcomingMatchRow,
} from "@/lib/matches"

// Same default tournament as scripts/scrape-schedule.ts.
const TOURNAMENT_ID = "2560854090247290879"
const REVALIDATE_SECONDS = 300

/**
 * Fetches the live schedule widget (no API key needed) and returns every
 * pending match. Cached by Next's fetch cache for a few minutes so page
 * views don't each hit Toornament. Returns null if Toornament is
 * unreachable so the page can say so instead of failing.
 */
export async function getLivePendingMatches(): Promise<
  ScheduledMatch[] | null
> {
  let html: string
  try {
    const res = await fetch(
      `https://widget.toornament.com/tournaments/${TOURNAMENT_ID}/matches/schedule/?_locale=en_US`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    )
    if (!res.ok) {
      console.error(`[toornament] Schedule request failed: HTTP ${res.status}`)
      return null
    }
    html = await res.text()
  } catch (error) {
    if (
      !(error instanceof TypeError) &&
      !(
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      )
    ) {
      throw error
    }
    console.error("[toornament] Could not fetch schedule:", error)
    return null
  }
  return parseScheduleWidget(html).filter((m) => m.status === "pending")
}

export function enrichUpcomingMatches(
  matches: ScheduledMatch[],
  teams: MatchTeam[]
): UpcomingMatchRow[] {
  function resolve(name: string): MatchTeam | null {
    if (!normalizeName(name)) return null
    const exact = teams.filter(
      (team) => normalizeName(team.teamName) === normalizeName(name)
    )
    if (exact.length) return exact.length === 1 ? exact[0] : null

    let best: MatchTeam | null = null
    let bestScore = MATCH_THRESHOLD_HIGH
    let tied = false
    for (const team of teams) {
      const score = scoreSimilarity(name, team.teamName)
      if (score > bestScore || (score === bestScore && best === null)) {
        best = team
        bestScore = score
        tied = false
      } else if (score === bestScore) {
        tied = true
      }
    }
    return tied ? null : best
  }

  return matches
    .filter((match) => match.status === "pending")
    .map((match) => {
      const teamA = resolve(match.teamAName)
      const teamB = resolve(match.teamBName)
      return {
        matchId: match.toornamentMatchId,
        scheduledAt: match.scheduledAt,
        teamAName: teamA?.teamName ?? match.teamAName,
        teamBName: teamB?.teamName ?? match.teamBName,
        teamARawName: match.teamAName,
        teamBRawName: match.teamBName,
        teamADivision: teamA?.division ?? null,
        teamBDivision: teamB?.division ?? null,
      }
    })
    .sort(
      (a, b) =>
        (matchDateTime(a.scheduledAt) ?? Infinity) -
          (matchDateTime(b.scheduledAt) ?? Infinity) ||
        a.matchId.localeCompare(b.matchId)
    )
}

export function involvesTeam(match: ScheduledMatch, teamName: string) {
  return [match.teamAName, match.teamBName].some(
    (n) => scoreSimilarity(n, teamName) >= MATCH_THRESHOLD_HIGH
  )
}

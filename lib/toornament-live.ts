import {
  parseScheduleWidget,
  type ScheduledMatch,
} from "@/lib/toornament-schedule"
import { MATCH_THRESHOLD_HIGH, scoreSimilarity } from "@/lib/matching"

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
  try {
    const res = await fetch(
      `https://widget.toornament.com/tournaments/${TOURNAMENT_ID}/matches/schedule/?_locale=en_US`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    )
    if (!res.ok) return null
    return parseScheduleWidget(await res.text()).filter(
      (m) => m.status === "pending"
    )
  } catch {
    return null
  }
}

export function involvesTeam(match: ScheduledMatch, teamName: string) {
  return [match.teamAName, match.teamBName].some(
    (n) => scoreSimilarity(n, teamName) >= MATCH_THRESHOLD_HIGH
  )
}

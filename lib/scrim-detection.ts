import { MATCH_THRESHOLD_LOW, scoreSimilarity } from "@/lib/matching"
import { matchDateTime } from "@/lib/matches"

// Wider than the 4-day window used to attach an official score: demo dates
// are unreliable, and a scrim is only claimed when nothing is anywhere near.
export const SCRIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type ScrimDemo = {
  demoDate: string | null
  teamAId: number | null
  teamBId: number | null
  teamAName: string | null
  teamBName: string | null
}

export type CompletedToornamentMatch = {
  scheduledAt: string
  teamAId: number | null
  teamBId: number | null
  teamAName: string
  teamBName: string
}

function sameTeams(demo: ScrimDemo, result: CompletedToornamentMatch) {
  const demoIds = [demo.teamAId, demo.teamBId].filter((id) => id !== null)
  if (
    demoIds.length > 0 &&
    demoIds.every((id) => id === result.teamAId || id === result.teamBId)
  ) {
    return true
  }
  if (!demo.teamAName || !demo.teamBName) return false
  const both = (a: string, b: string) =>
    scoreSimilarity(result.teamAName, a) >= MATCH_THRESHOLD_LOW &&
    scoreSimilarity(result.teamBName, b) >= MATCH_THRESHOLD_LOW
  return (
    both(demo.teamAName, demo.teamBName) || both(demo.teamBName, demo.teamAName)
  )
}

/**
 * A demo is a scrim when no completed, scored Toornament match involving its
 * teams was scheduled within a week of it. `completed` must already be
 * limited to completed matches with both scores set.
 */
export function isScrim(
  demo: ScrimDemo,
  completed: CompletedToornamentMatch[],
  windowMs = SCRIM_WINDOW_MS
): boolean {
  const hasTeam = demo.teamAId !== null || demo.teamBId !== null
  const demoTime = matchDateTime(demo.demoDate)
  // Can't judge the date: only hide demos that don't even resolve to a team.
  if (demoTime === null) return !hasTeam
  return !completed.some((result) => {
    const diff = Math.abs(new Date(result.scheduledAt).getTime() - demoTime)
    return diff <= windowMs && sameTeams(demo, result)
  })
}

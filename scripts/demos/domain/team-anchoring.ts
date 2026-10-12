import { stableBucketAIsCTForRoundIndex } from "@/lib/demo-stats"

// Pure, DB-free logic for the two matching-pipeline extensions described in
// docs (see issue #48): team-side anchoring (narrow candidate pools using
// already-matched teammates on the same stable side) and Toornament-date
// fallback (infer an unresolved side's team from the schedule once the
// other side is confirmed). Mirrors the style of lib/demo-stats.ts — no I/O,
// easy to exercise by hand without a test framework.

/**
 * Collapses a kill event's raw CT/T side into the stable "A"/"B" bucket for
 * its round, using the same half/OT schedule as reconstructFinalScore.
 * `round` is match_kills.round (0-based round index, i.e. total_rounds_played
 * at the moment of the kill — the same indexing reconstructFinalScore uses
 * for round_end events).
 */
export function stableSideForRound(round: number, side: "CT" | "T"): "A" | "B" {
  const bucketAIsCT = stableBucketAIsCTForRoundIndex(round)
  const isBucketA = bucketAIsCT ? side === "CT" : side === "T"
  return isBucketA ? "A" : "B"
}

export type KillSideRow = {
  round: number
  attackerSteamid64: string | null
  attackerSide: "CT" | "T" | null
  victimSteamid64: string
  victimSide: "CT" | "T" | null
}

/**
 * Tallies each steamid64's kill-events (as attacker or victim) per stable
 * side and assigns it to whichever side it appears on more often. Steamids
 * with zero kill-events (never appear as attacker or victim with a known
 * side) are omitted rather than guessed — e.g. a player who never got a kill
 * or death with recorded side data.
 */
export function deriveStableTeamSides(
  kills: KillSideRow[]
): Map<string, "A" | "B"> {
  const counts = new Map<string, Record<"A" | "B", number>>()

  function tally(
    steamid64: string | null,
    round: number,
    side: "CT" | "T" | null
  ) {
    if (!steamid64 || !side) return
    const bucket = stableSideForRound(round, side)
    if (!counts.has(steamid64)) counts.set(steamid64, { A: 0, B: 0 })
    counts.get(steamid64)![bucket]++
  }

  for (const k of kills) {
    tally(k.attackerSteamid64, k.round, k.attackerSide)
    tally(k.victimSteamid64, k.round, k.victimSide)
  }

  const result = new Map<string, "A" | "B">()
  for (const [steamid64, { A, B }] of counts) {
    if (A === B) continue // tied — not enough signal, omit rather than guess
    result.set(steamid64, A > B ? "A" : "B")
  }
  return result
}

export type ToornamentCandidate = {
  toornamentMatchId: number
  scheduledAt: string // ISO
  opponentTeamId: number
}

export type ToornamentFallbackResult =
  | { status: "resolved"; opponentTeamId: number; toornamentMatchId: number }
  | { status: "no_candidate" }
  | { status: "ambiguous"; candidateIds: number[] }

/**
 * Given a confirmed team and the demo's date, finds that team's closest
 * `completed` Toornament match within `toleranceHours` and returns the
 * opponent — but only if it's the *unique* closest candidate. Ties (equally
 * close candidates) or nothing within the window are left unresolved rather
 * than guessed.
 */
export function findClosestToornamentMatch(
  demoDate: string,
  candidates: ToornamentCandidate[],
  toleranceHours = 24
): ToornamentFallbackResult {
  const demoTime = new Date(demoDate).getTime()
  if (Number.isNaN(demoTime)) return { status: "no_candidate" }

  const toleranceMs = toleranceHours * 60 * 60 * 1000
  const withinWindow = candidates
    .map((c) => ({
      ...c,
      deltaMs: Math.abs(new Date(c.scheduledAt).getTime() - demoTime),
    }))
    .filter((c) => !Number.isNaN(c.deltaMs) && c.deltaMs <= toleranceMs)

  if (withinWindow.length === 0) return { status: "no_candidate" }

  const minDelta = Math.min(...withinWindow.map((c) => c.deltaMs))
  const closest = withinWindow.filter((c) => c.deltaMs === minDelta)

  if (closest.length > 1) {
    return {
      status: "ambiguous",
      candidateIds: closest.map((c) => c.toornamentMatchId),
    }
  }

  return {
    status: "resolved",
    opponentTeamId: closest[0].opponentTeamId,
    toornamentMatchId: closest[0].toornamentMatchId,
  }
}

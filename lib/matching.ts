import { distance } from "fastest-levenshtein"

export const MATCH_THRESHOLD_HIGH = 0.85
export const MATCH_THRESHOLD_LOW = 0.5

export type MatchStatus =
  "unmatched" | "auto_high" | "auto_low" | "manual" | "ambiguous"

export type MatchCandidate = {
  rosterEntryId: number
  nickname: string
}

export type MatchResult = {
  // Usually one roster entry. A nickname can legitimately recur across
  // several roster_entries for the same real person (they play multiple
  // seasons/teams under the same tag) — those all tie for the best score
  // and should all be linked to this steamid, so this is an array rather
  // than assuming "ambiguous" means two different people share a nickname.
  rosterEntryIds: number[]
  confidence: number | null
  status: MatchStatus
}

/** Lowercase, trim, and strip accents/punctuation so nickname comparisons
 * ignore case/diacritic noise (e.g. "Fermergård" vs "fermergard"). */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
}

/** 1 - normalized Levenshtein distance, in [0, 1]. Identical strings score 1;
 * completely different strings of the same length score close to 0. */
export function scoreSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na.length === 0 || nb.length === 0) return 0
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  return 1 - distance(na, nb) / maxLen
}

/**
 * Resolve a demo player's identity against the roster. An explicit manual
 * override always wins. Otherwise, score the in-game name against every
 * roster-nickname candidate (already narrowed down by the caller — e.g. to
 * one team, or to still-unmatched entries) and classify by threshold.
 * Two or more candidates tying for the best score is reported as `ambiguous`
 * rather than guessing.
 */
export function resolvePlayerMatch(
  inGameName: string,
  candidates: MatchCandidate[],
  override?: { rosterEntryId: number } | null
): MatchResult {
  if (override) {
    return {
      rosterEntryIds: [override.rosterEntryId],
      confidence: 1,
      status: "manual",
    }
  }

  if (candidates.length === 0) {
    return { rosterEntryIds: [], confidence: null, status: "unmatched" }
  }

  let best = -Infinity
  let bestIds: number[] = []
  for (const candidate of candidates) {
    const score = scoreSimilarity(inGameName, candidate.nickname)
    if (score > best) {
      best = score
      bestIds = [candidate.rosterEntryId]
    } else if (score === best) {
      bestIds.push(candidate.rosterEntryId)
    }
  }

  if (best < MATCH_THRESHOLD_LOW) {
    return { rosterEntryIds: [], confidence: best, status: "unmatched" }
  }
  if (bestIds.length > 1) {
    // Multiple roster entries tied for the best score. An exact-normalized
    // match (score 1) is overwhelmingly a real player reusing the same tag
    // across seasons/teams — link all of them to this one steamid. A tied
    // fuzzy (non-exact) score is riskier (could be two different people
    // with similarly-misspelled nicknames) and is left for manual review.
    if (best === 1) {
      return { rosterEntryIds: bestIds, confidence: best, status: "auto_high" }
    }
    return { rosterEntryIds: [], confidence: best, status: "ambiguous" }
  }
  if (best >= MATCH_THRESHOLD_HIGH) {
    return { rosterEntryIds: bestIds, confidence: best, status: "auto_high" }
  }
  return { rosterEntryIds: bestIds, confidence: best, status: "auto_low" }
}

/**
 * Lineups for the playoff match preview. Hand-picked lineups win; otherwise
 * we use the exact roster combination that appeared in the most demos.
 */

/** Hand-picked lineups, by team name -> roster nicknames (case-insensitive). */
export const LINEUP_OVERRIDES: Record<string, string[]> = {
  "Netlight AB Duende": ["kn0rring", "MRK", "Domilz", "bmx", "mini", "Bralle"],
  "Sciber AB": ["Schuster", "Blandfers", "sQren", "olander", "Bruno"],
  "CGI Sverige AB 1": ["Mattrovic", "ezki", "xelos", "forsan", "wallak"],
}

/** Teams that show a fixed map pool instead of their top maps (no scouting). */
export const HIDDEN_MAP_POOLS: Record<string, string[]> = {
  "Netlight AB Duende": ["de_train", "de_vertigo", "de_dust2", "de_anubis"],
}

/**
 * Teams that have won a match Toornament hasn't recorded yet. The bracket page
 * applies these locally (winner marked, moved into the next round), so remove
 * an entry once Toornament catches up.
 */
export const ASSUMED_ADVANCERS: string[] = ["Inet AB"]

export type DemoAppearance = { matchId: number; steamids: string[] }

/**
 * The exact set of players that shared a demo most often. Ties go to the set
 * seen in the most recent demo (higher matchId = ingested later). Null when
 * there are no demos.
 */
export function pickMostPlayedLineup(
  demos: DemoAppearance[]
): { steamids: string[]; count: number } | null {
  const sets = new Map<
    string,
    { steamids: string[]; count: number; latest: number }
  >()
  for (const demo of demos) {
    const steamids = [...new Set(demo.steamids)].sort()
    if (!steamids.length) continue
    const key = steamids.join(",")
    const entry = sets.get(key) ?? { steamids, count: 0, latest: -Infinity }
    entry.count += 1
    entry.latest = Math.max(entry.latest, demo.matchId)
    sets.set(key, entry)
  }
  const best = [...sets.values()].sort(
    (a, b) => b.count - a.count || b.latest - a.latest
  )[0]
  return best ? { steamids: best.steamids, count: best.count } : null
}

export type NamedPlayer = { nickname: string; inGameName: string | null }

/** Resolves override nicknames to roster entries, keeping the given order. */
export function resolveNicknames<T extends NamedPlayer>(
  nicknames: string[],
  roster: T[]
): T[] {
  const found: T[] = []
  for (const wanted of nicknames) {
    const key = wanted.toLowerCase()
    const hit =
      roster.find((p) => p.nickname.toLowerCase() === key) ??
      roster.find((p) => p.inGameName?.toLowerCase() === key)
    if (hit && !found.includes(hit)) found.push(hit)
  }
  return found
}

import { normalizeName } from "@/lib/matching"
import type { UpcomingMatchRow } from "@/lib/matches"

export type StreamAssignment = {
  matchId: string
  teamAName: string | null
  teamBName: string | null
  url: string
  caster: string | null
}

export type ParsedStreamMessage = {
  assignments: StreamAssignment[]
  /** Non-empty lines that mention a Twitch link or two teams but couldn't be tied to a match + link. */
  unmatched: string[]
}

const NOT_CHANNELS = new Set(["videos", "directory", "downloads", "p"])
const TWITCH_URL =
  /(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})/gi

/** Finds twitch.tv channel links and normalizes them to https://www.twitch.tv/<channel>. */
export function extractTwitchUrls(text: string): string[] {
  const urls: string[] = []
  for (const m of text.matchAll(TWITCH_URL)) {
    const channel = m[1].toLowerCase()
    if (NOT_CHANNELS.has(channel)) continue
    const url = `https://www.twitch.tv/${channel}`
    if (!urls.includes(url)) urls.push(url)
  }
  return urls
}

/**
 * Reads `🎙️ Kommentator: Oscar "@berko" Bertling` as `Oscar "Berko" Bertling`:
 * the handle keeps its quotes but loses the @ and gets a capital letter.
 */
export function extractCaster(text: string): string | null {
  const m = text.match(/(?:kommentator|caster|commentator)\w*\s*:\s*(.+)/i)
  if (!m) return null
  const name = m[1]
    .replace(/["“”]@?([^"“”]*)["“”]/g, (_, tag: string) =>
      tag.trim() ? `"${tag.trim().replace(/^./, (c) => c.toUpperCase())}"` : ""
    )
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return name || null
}

function mentions(normalizedText: string, name: string | null | undefined) {
  if (!name) return false
  const n = normalizeName(name)
  return n.length >= 2 && normalizedText.includes(n)
}

const FILLER_WORDS = new Set(["ab", "och", "cs"])

/** Lowercased words of a team name, minus legal-form and filler words. */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !FILLER_WORDS.has(w))
  )
}

function isSubset(a: Set<string>, b: Set<string>) {
  return a.size > 0 && [...a].every((w) => b.has(w))
}

/**
 * Announcements abbreviate and reorder names ("Fortnox", "Boulder Golden"
 * for "Fortnox AB", "Golden Boulder AB"), so one side matches when its words
 * are contained in the team's words or the other way round.
 */
function sideMatches(side: string, ...names: (string | null | undefined)[]) {
  const words = nameTokens(side)
  return names.some((n) => {
    if (!n) return false
    const t = nameTokens(n)
    return isSubset(words, t) || isSubset(t, words)
  })
}

function findMatch(line: string, upcoming: UpcomingMatchRow[]) {
  const stripped = line.replace(TWITCH_URL, " ")
  const sides = stripped.split(/\bvs\.?(?=\s|$)/i)
  if (sides.length === 2) {
    const [left, right] = sides
    const found = upcoming.find(
      (m) =>
        (sideMatches(left, m.teamAName, m.teamARawName) &&
          sideMatches(right, m.teamBName, m.teamBRawName)) ||
        (sideMatches(left, m.teamBName, m.teamBRawName) &&
          sideMatches(right, m.teamAName, m.teamARawName))
    )
    if (found) return found
  }
  const text = normalizeName(stripped)
  // upcoming is sorted by date, so if the same pairing appears twice the
  // earliest one wins.
  return upcoming.find(
    (m) =>
      (mentions(text, m.teamAName) || mentions(text, m.teamARawName)) &&
      (mentions(text, m.teamBName) || mentions(text, m.teamBRawName))
  )
}

/**
 * Ties a pasted Discord announcement to upcoming matches. Messages are split
 * into blocks at blank lines. A line naming both teams of an upcoming match
 * gets the Twitch link on that line, else the next link below it in the
 * block, else the block's only link.
 */
export function parseStreamMessage(
  text: string,
  upcoming: UpcomingMatchRow[]
): ParsedStreamMessage {
  const assignments = new Map<string, StreamAssignment>()
  const unmatched: string[] = []
  // Announcements list the commentator once, after the last match on a
  // channel, so the caster applies to every match on that channel.
  const casterByUrl = new Map<string, string>()
  for (const block of text.split(/\n\s*\n/)) {
    const urls = extractTwitchUrls(block)
    const caster = extractCaster(block)
    if (caster && urls.length === 1) casterByUrl.set(urls[0], caster)
  }

  for (const block of text.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    const blockUrls = extractTwitchUrls(block)
    const used = new Set<string>()

    lines.forEach((line, i) => {
      const match = findMatch(line, upcoming)
      if (!match) return
      let url = extractTwitchUrls(line)[0]
      if (!url) {
        for (const later of lines.slice(i + 1)) {
          if (findMatch(later, upcoming)) break
          url = extractTwitchUrls(later)[0]
          if (url) break
        }
      }
      if (!url && blockUrls.length === 1) url = blockUrls[0]
      if (!url) {
        unmatched.push(line)
        return
      }
      used.add(line)
      for (const l of lines) if (extractTwitchUrls(l).includes(url)) used.add(l)
      assignments.set(match.matchId, {
        matchId: match.matchId,
        teamAName: match.teamAName,
        teamBName: match.teamBName,
        url,
        caster: casterByUrl.get(url) ?? null,
      })
    })

    for (const line of lines) {
      if (used.has(line) || findMatch(line, upcoming)) continue
      if (extractTwitchUrls(line).length > 0 && !unmatched.includes(line))
        unmatched.push(line)
    }
  }

  return { assignments: [...assignments.values()], unmatched }
}

import * as cheerio from "cheerio"
import type { ScrapedPlayer } from "@/lib/roster-types"

/**
 * Parse one team's rich-text lineup block (as hand-typed by league editors)
 * into a team name and player list. Tolerant of the real-world inconsistencies
 * seen on publiclir.se: team name and first player sometimes share one <p>,
 * nicknames can contain spaces, stray leading/trailing whitespace and
 * `&nbsp;` show up, and some lines won't have a quoted nickname at all.
 */
export function parseTeamBlock(
  bodyText: string
): { teamName: string; players: ScrapedPlayer[] } | null {
  const $ = cheerio.load(bodyText)
  const paragraphs = $("p").toArray()
  if (paragraphs.length === 0) return null

  const first = $(paragraphs[0])
  let teamName = first.find("strong").first().text() || first.text()
  teamName = teamName.replace(/\s+/g, " ").trim()
  if (!teamName) return null

  // Any player lines that shared the first <p> with the header end up here
  // once the header's strong/span is stripped out.
  const firstRemainder = first.clone()
  firstRemainder.find("strong, span").remove()
  let playerHtml = firstRemainder.html() ?? ""
  for (let i = 1; i < paragraphs.length; i++) {
    playerHtml += $.html(paragraphs[i]) ?? ""
  }

  const lines = playerHtml
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, ""))
    .map((l) => l.replace(/&nbsp;/gi, " "))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const players: ScrapedPlayer[] = []
  for (const rawLine of lines) {
    const line = rawLine.replace(/^-+\s*/, "").trim()
    if (!line) continue

    // Nicknames are usually wrapped in straight quotes, but editors have
    // also used curly/smart quotes (” “) and occasionally doubled quotes
    // with nothing between them (a typo, not an intentionally empty nick).
    const match = line.match(/["”“]+\s*([^"”“]+?)\s*["”“]+/)
    if (match && match[1].trim()) {
      const nickname = match[1].trim()
      const before = line.slice(0, match.index).trim()
      const after = line.slice(match.index! + match[0].length).trim()
      const realName = [before, after].filter(Boolean).join(" ").trim()
      players.push({ nickname, realName: realName || null })
    } else {
      // No quoted nickname found (e.g. a bare handle like "i_PAID_FOR_WiNRAR")
      // — log for manual review but still keep the player, using the raw
      // text as the nickname.
      console.warn(`[scrape-roster] no quoted nickname in line: "${line}"`)
      players.push({ nickname: line, realName: null })
    }
  }

  return { teamName, players }
}

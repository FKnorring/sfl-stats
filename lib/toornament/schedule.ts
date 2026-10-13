import * as cheerio from "cheerio"

export type ScheduledMatchStatus = "pending" | "completed"

export type ScheduledMatch = {
  toornamentMatchId: string
  scheduledAt: string | null
  teamAName: string
  teamBName: string
  teamALogoPath: string | null
  teamBLogoPath: string | null
  teamAScore: number | null
  teamBScore: number | null
  status: ScheduledMatchStatus
}

/**
 * Parses Toornament's schedule widget HTML (the embed publiclir.se puts on
 * the SFL roster page, e.g.
 * https://widget.toornament.com/tournaments/{id}/matches/schedule/?_locale=en_US).
 * This widget is server-rendered static HTML (unlike the main
 * play.toornament.com tournament page, which hydrates client-side and has
 * no match data in the initial response), so a plain fetch + cheerio works
 * with no API key.
 *
 * A match is "pending" when neither opponent's `.name` div has a
 * win/loss class and no `.result` div is present — Toornament fills those
 * in only once a match has been played.
 */
export function parseScheduleWidget(html: string): ScheduledMatch[] {
  const $ = cheerio.load(html)
  const matches: ScheduledMatch[] = []

  $('[data-role="sch-event"]').each((_, eventEl) => {
    const event = $(eventEl)
    const scheduledAt = event.attr("data-time")?.trim() || null

    event.find('.match[data-type="match"]').each((_, matchEl) => {
      const match = $(matchEl)
      const matchId = match.attr("data-id")?.trim()
      if (!matchId) return

      const opponents = match.find(".opponent")
      if (opponents.length < 2) return

      const names = opponents
        .toArray()
        .map((el) =>
          $(el).find(".name").first().text().replace(/\s+/g, " ").trim()
        )
      const [teamAName, teamBName] = names
      if (!teamAName || !teamBName) return

      const logoPaths = opponents
        .toArray()
        .map(
          (el) => $(el).find(".logo img").first().attr("src")?.trim() || null
        )
      const [teamALogoPath, teamBLogoPath] = logoPaths

      const scores = opponents.toArray().map((el) => {
        const text = $(el).find(".result").first().text().trim()
        if (!text) return null
        const n = Number(text)
        return Number.isFinite(n) ? n : null
      })
      const [teamAScore, teamBScore] = scores

      const hasResult = match.find(".result").length > 0
      const hasWinLossClass = opponents.toArray().some((el) => {
        const classes = $(el).find(".name").first().attr("class") ?? ""
        return /\bwin\b|\bloss\b/.test(classes)
      })
      const status: ScheduledMatchStatus =
        hasResult || hasWinLossClass ? "completed" : "pending"

      matches.push({
        toornamentMatchId: matchId,
        scheduledAt,
        teamAName,
        teamBName,
        teamALogoPath,
        teamBLogoPath,
        teamAScore,
        teamBScore,
        status,
      })
    })
  })

  return matches
}

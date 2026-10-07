import {
  parseScheduleWidget,
  type ScheduledMatch,
} from "@/lib/toornament-schedule"
import {
  matchDateTime,
  type MatchTeam,
  type UpcomingMatchRow,
} from "@/lib/matches"
import { extractRootComponentJson } from "@/lib/root-component-json"
import { pageJsonSchema } from "@/lib/roster-types"
import { extractCs2DivisionStages } from "@/lib/roster-extract"
import {
  parseStandingsWidget,
  resolveOfficialTeam,
  type OfficialStanding,
} from "@/lib/toornament-standings"

// Same default tournament as scripts/scrape-schedule.ts.
const TOURNAMENT_ID = "2560854090247290879"
const REVALIDATE_SECONDS = 300

/**
 * Fetches the live schedule widget (no API key needed) and returns every
 * pending match. Cached by Next's fetch cache for a few minutes so page
 * views don't each hit Toornament. Returns null if Toornament is
 * unreachable so the page can say so instead of failing.
 */
export async function getLivePendingMatches(
  tournamentId = TOURNAMENT_ID
): Promise<ScheduledMatch[] | null> {
  let html: string
  try {
    const res = await fetch(
      `https://widget.toornament.com/tournaments/${tournamentId}/matches/schedule/?_locale=en_US`,
      {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(10000),
      }
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
  const matches = parseScheduleWidget(html)
  if (
    !matches.length &&
    (/data-role\s*=\s*["']sch-event["']/.test(html) ||
      !/data-role\s*=\s*["']sch-[^"']+["']/.test(html))
  ) {
    console.error("[toornament] Unrecognized schedule markup")
    return null
  }
  return matches.filter((m) => m.status === "pending")
}

export function enrichUpcomingMatches(
  matches: ScheduledMatch[],
  teams: MatchTeam[]
): UpcomingMatchRow[] {
  function resolve(name: string): MatchTeam | null {
    return resolveOfficialTeam(name, teams)
  }

  return matches
    .filter((match) => match.status === "pending")
    .map((match) => {
      const teamA = resolve(match.teamAName)
      const teamB = resolve(match.teamBName)
      return {
        matchId: match.toornamentMatchId,
        teamAId: teamA?.teamId ?? null,
        teamBId: teamB?.teamId ?? null,
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

export type LiveStandingsResult = {
  rows: (OfficialStanding & { teamId: number | null })[]
  error: string | null
  sourceUrl: string | null
}

async function divisionStage(team: MatchTeam): Promise<string> {
  const page = await fetch("https://publiclir.se/svenska-foeretagsligan/", {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(10000),
  })
  if (!page.ok) throw new Error(`League page: HTTP ${page.status}`)
  const content = pageJsonSchema.parse(
    extractRootComponentJson(await page.text())
  )
  const stages = extractCs2DivisionStages(
    content.pageContent.fields.contentArea
  ).filter(
    (stage) => stage.season === team.season && stage.division === team.division
  )
  if (stages.length !== 1)
    throw new Error("No unique current-season division stage")
  return stages[0].path
}

export async function getLiveTeamPendingMatches(
  team: MatchTeam
): Promise<ScheduledMatch[] | null> {
  try {
    const stage = await divisionStage(team)
    const tournamentId = stage.split("/")[2]
    return await getLivePendingMatches(tournamentId)
  } catch (error) {
    console.error("[toornament] Could not load current-season schedule:", error)
    return null
  }
}

export async function getLiveDivisionStandings(
  team: MatchTeam,
  teams: MatchTeam[]
): Promise<LiveStandingsResult> {
  let sourceUrl: string | null = null
  try {
    sourceUrl = `https://widget.toornament.com${await divisionStage(team)}`
    const response = await fetch(sourceUrl, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Ranking widget: HTTP ${response.status}`)
    const divisionTeams = teams.filter(
      (candidate) =>
        candidate.season === team.season && candidate.division === team.division
    )
    const rows = parseStandingsWidget(await response.text()).map((row) => ({
      ...row,
      teamId: resolveOfficialTeam(row.teamName, divisionTeams)?.teamId ?? null,
    }))
    const counts = new Map<number, number>()
    for (const row of rows) {
      if (row.teamId !== null)
        counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1)
    }
    for (const row of rows) {
      if (row.teamId !== null && counts.get(row.teamId) !== 1) row.teamId = null
    }
    const identified = rows.filter((row) => row.teamId === team.teamId)
    return {
      rows,
      sourceUrl,
      error:
        identified.length === 1
          ? null
          : "Your team's official placement could not be identified confidently.",
    }
  } catch (error) {
    console.error(
      "[toornament] Could not load official division placement:",
      error
    )
    return {
      rows: [],
      sourceUrl,
      error: "Official division placement is unavailable right now.",
    }
  }
}

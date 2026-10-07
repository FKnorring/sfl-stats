import { sql } from "drizzle-orm"

import { openWritableDb, type AppDb } from "@/lib/db/client"
import {
  parseScheduleWidget,
  type ScheduledMatch,
} from "@/lib/toornament-schedule"
import { scoreSimilarity, MATCH_THRESHOLD_LOW } from "@/lib/matching"

const DEFAULT_TOURNAMENT_ID = "2560854090247290879"
const DEFAULT_LOCALE = "en_US"

// Seasons before 9 are excluded everywhere in the app — mirrors
// lib/db.ts's SEASON_CUTOFF_SQL/MIN_SEASON (scripts don't import the
// app's read-only db connection, so this is kept in sync by hand).
const MIN_SEASON = 9

function parseArgs(argv: string[]): { tournamentId: string; locale: string } {
  function flag(name: string): string | null {
    const idx = argv.indexOf(name)
    return idx !== -1 ? (argv[idx + 1] ?? null) : null
  }
  return {
    tournamentId: flag("--tournament-id") ?? DEFAULT_TOURNAMENT_ID,
    locale: flag("--locale") ?? DEFAULT_LOCALE,
  }
}

async function fetchScheduleWidget(
  tournamentId: string,
  locale: string
): Promise<string> {
  const url = `https://widget.toornament.com/tournaments/${tournamentId}/matches/schedule/?_locale=${locale}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

type TeamRow = { id: number; name: string }

async function getCurrentSeasonTeams(db: AppDb): Promise<TeamRow[]> {
  const seasons = (await db.all(
    sql`SELECT DISTINCT season FROM teams WHERE CAST(TRIM(REPLACE(season, 'SFL Säsong', '')) AS INTEGER) >= ${MIN_SEASON}`
  )) as { season: string }[]
  if (seasons.length === 0) return []
  const currentSeason = seasons
    .map((r) => r.season)
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10)
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10)
      return nb - na
    })[0]
  return (await db.all(
    sql`SELECT id, name FROM teams WHERE season = ${currentSeason}`
  )) as TeamRow[]
}

function resolveTeam(name: string, teams: TeamRow[]): number | null {
  let best = -Infinity
  let bestId: number | null = null
  for (const team of teams) {
    const score = scoreSimilarity(name, team.name)
    if (score > best) {
      best = score
      bestId = team.id
    }
  }
  return best >= MATCH_THRESHOLD_LOW ? bestId : null
}

const WIDGET_BASE = "https://widget.toornament.com"

/**
 * The schedule widget's inline logo <img> uses the tiny icon_small variant;
 * swap it for logo_large (256x256, confirmed available for every current
 * team) since the same media file ID serves multiple sizes. Falls back to
 * the path as-is if Toornament ever changes this naming.
 */
function resolveLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null
  const absolutePath = logoPath.replace(/^\/?/, "/")
  const upsized = absolutePath.replace(/\/icon_small(?=\?|$)/, "/logo_large")
  return `${WIDGET_BASE}${upsized}`
}

async function upsertMatches(
  db: AppDb,
  matches: ScheduledMatch[],
  teams: TeamRow[]
) {
  const now = new Date().toISOString()

  let resolvedBoth = 0
  let resolvedOne = 0
  let resolvedNone = 0
  let pending = 0
  let completed = 0
  let logosCaptured = 0

  await db.transaction(async (tx) => {
    for (const m of matches) {
      const teamAId = resolveTeam(m.teamAName, teams)
      const teamBId = resolveTeam(m.teamBName, teams)

      if (teamAId && teamBId) resolvedBoth++
      else if (teamAId || teamBId) resolvedOne++
      else resolvedNone++
      if (m.status === "pending") pending++
      else completed++

      await tx.run(sql`
        INSERT INTO toornament_matches
          (toornament_match_id, scheduled_at, round_label, team_a_name_raw, team_b_name_raw, team_a_id, team_b_id, team_a_score, team_b_score, status, scraped_at)
        VALUES
          (${m.toornamentMatchId}, ${m.scheduledAt}, ${null}, ${m.teamAName}, ${m.teamBName}, ${teamAId}, ${teamBId}, ${m.teamAScore}, ${m.teamBScore}, ${m.status}, ${now})
        ON CONFLICT(toornament_match_id) DO UPDATE SET
          scheduled_at = excluded.scheduled_at,
          round_label = excluded.round_label,
          team_a_name_raw = excluded.team_a_name_raw,
          team_b_name_raw = excluded.team_b_name_raw,
          team_a_id = excluded.team_a_id,
          team_b_id = excluded.team_b_id,
          team_a_score = excluded.team_a_score,
          team_b_score = excluded.team_b_score,
          status = excluded.status,
          scraped_at = excluded.scraped_at
      `)

      // Only write when a logo was actually captured this run, so a
      // transient scrape miss never clobbers a previously-captured logo.
      for (const [teamId, logoPath] of [
        [teamAId, m.teamALogoPath],
        [teamBId, m.teamBLogoPath],
      ] as const) {
        const logoUrl = resolveLogoUrl(logoPath)
        if (teamId == null || logoUrl == null) continue
        await tx.run(
          sql`UPDATE teams SET logo_url = ${logoUrl} WHERE id = ${teamId}`
        )
        logosCaptured++
      }
    }
  })

  return {
    resolvedBoth,
    resolvedOne,
    resolvedNone,
    pending,
    completed,
    logosCaptured,
  }
}

async function main() {
  const { tournamentId, locale } = parseArgs(process.argv.slice(2))

  console.log(
    `[scrape-schedule] fetching schedule widget for tournament ${tournamentId}`
  )
  const html = await fetchScheduleWidget(tournamentId, locale)

  const matches = parseScheduleWidget(html)
  console.log(`[scrape-schedule] parsed ${matches.length} matches`)

  const db = openWritableDb()
  const teams = await getCurrentSeasonTeams(db)
  console.log(
    `[scrape-schedule] resolving opponents against ${teams.length} current-season team(s)`
  )
  const summary = await upsertMatches(db, matches, teams)
  console.log(
    `[scrape-schedule] upserted ${matches.length} matches ` +
      `(${summary.pending} pending, ${summary.completed} completed); ` +
      `opponents resolved: both sides ${summary.resolvedBoth}, one side ${summary.resolvedOne}, neither ${summary.resolvedNone}; ` +
      `logos captured: ${summary.logosCaptured}`
  )
}

main().catch((err) => {
  console.error("[scrape-schedule] failed:", err)
  process.exit(1)
})

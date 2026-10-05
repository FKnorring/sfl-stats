import { openWritableDb } from "./db-writable"
import { extractRootComponentJson } from "@/lib/root-component-json"
import { pageJsonSchema } from "@/lib/roster-types"
import { extractCs2Rosters } from "@/lib/roster-extract"
import type Database from "better-sqlite3"
import type { ScrapedTeam } from "@/lib/roster-types"

const DEFAULT_URL = "https://publiclir.se/svenska-foeretagsligan/"

function parseArgs(argv: string[]): { url: string } {
  const idx = argv.indexOf("--url")
  const url = idx !== -1 ? argv[idx + 1] : DEFAULT_URL
  if (!url) throw new Error("--url requires a value")
  return { url }
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

function upsertTeamsAndRoster(db: Database.Database, teams: ScrapedTeam[]) {
  const now = new Date().toISOString()

  const upsertTeam = db.prepare(`
    INSERT INTO teams (name, season, division)
    VALUES (@name, @season, @division)
    ON CONFLICT(name, season, division) DO NOTHING
  `)
  const getTeamId = db.prepare(`
    SELECT id FROM teams WHERE name = ? AND season = ? AND division = ?
  `)
  const insertRosterEntry = db.prepare(`
    INSERT INTO roster_entries (team_id, nickname, real_name, match_status, scraped_at)
    VALUES (@teamId, @nickname, @realName, 'unmatched', @scrapedAt)
  `)
  // roster_entries has no unique constraint by design (a nickname can
  // repeat across seasons/teams), so dedupe by hand against the exact
  // same (team, nickname, real_name) row to keep repeated scrape runs
  // idempotent instead of piling up duplicate rows.
  const existingEntry = db.prepare(`
    SELECT id FROM roster_entries
    WHERE team_id = ? AND nickname = ? AND IFNULL(real_name, '') = IFNULL(?, '')
  `)

  let teamCount = 0
  let newRosterEntries = 0
  let skippedExisting = 0

  const tx = db.transaction((scrapedTeams: ScrapedTeam[]) => {
    for (const team of scrapedTeams) {
      upsertTeam.run({
        name: team.teamName,
        season: team.season,
        division: team.division,
      })
      const row = getTeamId.get(team.teamName, team.season, team.division) as
        { id: number } | undefined
      if (!row) {
        console.warn(
          `[scrape-roster] could not resolve team id for "${team.teamName}" (${team.season}/${team.division})`
        )
        continue
      }
      teamCount++

      for (const player of team.players) {
        const existing = existingEntry.get(
          row.id,
          player.nickname,
          player.realName
        )
        if (existing) {
          skippedExisting++
          continue
        }
        insertRosterEntry.run({
          teamId: row.id,
          nickname: player.nickname,
          realName: player.realName,
          scrapedAt: now,
        })
        newRosterEntries++
      }
    }
  })

  tx(teams)
  return { teamCount, newRosterEntries, skippedExisting }
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2))

  console.log(`[scrape-roster] fetching ${url}`)
  const html = await fetchPage(url)

  console.log(`[scrape-roster] extracting embedded page JSON`)
  const raw = extractRootComponentJson(html)
  const page = pageJsonSchema.parse(raw)

  const teams = extractCs2Rosters(page.pageContent.fields.contentArea)
  console.log(`[scrape-roster] found ${teams.length} CS2 team lineups`)

  const db = openWritableDb()
  try {
    const { teamCount, newRosterEntries, skippedExisting } =
      upsertTeamsAndRoster(db, teams)
    console.log(
      `[scrape-roster] upserted ${teamCount} teams, ${newRosterEntries} new roster entries` +
        (skippedExisting ? ` (${skippedExisting} already present)` : "")
    )
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error("[scrape-roster] failed:", err)
  process.exit(1)
})

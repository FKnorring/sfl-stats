import { sql } from "drizzle-orm"

import { openWritableDb, type AppDb } from "@/lib/db/client"
import { extractRootComponentJson } from "@/lib/root-component-json"
import { pageJsonSchema } from "@/lib/roster-types"
import { extractCs2Rosters } from "@/lib/roster-extract"
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

async function upsertTeamsAndRoster(db: AppDb, teams: ScrapedTeam[]) {
  const now = new Date().toISOString()

  let teamCount = 0
  let newRosterEntries = 0
  let skippedExisting = 0

  await db.transaction(async (tx) => {
    for (const team of teams) {
      await tx.run(sql`
        INSERT INTO teams (name, season, division)
        VALUES (${team.teamName}, ${team.season}, ${team.division})
        ON CONFLICT(name, season, division) DO NOTHING
      `)
      const rows = (await tx.all(
        sql`SELECT id FROM teams WHERE name = ${team.teamName} AND season = ${team.season} AND division = ${team.division}`
      )) as { id: number }[]
      const row = rows[0]
      if (!row) {
        console.warn(
          `[scrape-roster] could not resolve team id for "${team.teamName}" (${team.season}/${team.division})`
        )
        continue
      }
      teamCount++

      for (const player of team.players) {
        const existing = (await tx.all(
          sql`
            SELECT id FROM roster_entries
            WHERE team_id = ${row.id} AND nickname = ${player.nickname}
              AND IFNULL(real_name, '') = IFNULL(${player.realName}, '')
          `
        )) as { id: number }[]
        if (existing.length > 0) {
          skippedExisting++
          continue
        }
        await tx.run(sql`
          INSERT INTO roster_entries (team_id, nickname, real_name, match_status, scraped_at)
          VALUES (${row.id}, ${player.nickname}, ${player.realName}, 'unmatched', ${now})
        `)
        newRosterEntries++
      }
    }
  })

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
  const { teamCount, newRosterEntries, skippedExisting } =
    await upsertTeamsAndRoster(db, teams)
  console.log(
    `[scrape-roster] upserted ${teamCount} teams, ${newRosterEntries} new roster entries` +
      (skippedExisting ? ` (${skippedExisting} already present)` : "")
  )
}

main().catch((err) => {
  console.error("[scrape-roster] failed:", err)
  process.exit(1)
})

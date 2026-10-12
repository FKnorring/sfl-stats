import fs from "node:fs"
import path from "node:path"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { openWritableDb } from "@/lib/db/client"
import { withCacheInvalidation } from "../cache/revalidate-cache"
import { applyOverrides, type PlayerOverrides } from "./player-matching"
import { runDemoIngestion } from "./ingestion"

const DEFAULT_DIR = path.join(process.cwd(), "demos")
const OVERRIDES_PATH = path.join(process.cwd(), "data", "player-overrides.json")
const DEFAULT_TOORNAMENT_WINDOW_HOURS = 24

function parseArgs(argv: string[]): {
  dir: string
  toornamentWindowHours: number
} {
  const idx = argv.indexOf("--dir")
  const dir =
    idx !== -1 ? argv[idx + 1] : (process.env.DEMOS_DIR ?? DEFAULT_DIR)
  if (!dir) throw new Error("--dir requires a value")

  const windowIdx = argv.indexOf("--toornament-window-hours")
  const toornamentWindowHours =
    windowIdx !== -1
      ? Number(argv[windowIdx + 1])
      : DEFAULT_TOORNAMENT_WINDOW_HOURS
  if (!Number.isFinite(toornamentWindowHours) || toornamentWindowHours <= 0) {
    throw new Error("--toornament-window-hours requires a positive number")
  }
  return { dir, toornamentWindowHours }
}

function walkDemosFolder(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    // statSync follows symlinks used for synced/linked Demo folders.
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      out.push(...walkDemosFolder(full))
    } else if (stat.isFile() && entry.name.toLowerCase().endsWith(".dem")) {
      out.push(full)
    }
  }
  return out
}

const overridesFileSchema = z.record(
  z.string(),
  z.object({
    rosterEntryId: z.number(),
    note: z.string().optional(),
  })
)

function loadOverrides(): PlayerOverrides {
  if (!fs.existsSync(OVERRIDES_PATH)) return new Map()
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"))
  return new Map(Object.entries(overridesFileSchema.parse(raw)))
}

async function main() {
  await withCacheInvalidation("demos", async (markWritePhase) => {
    const { dir, toornamentWindowHours } = parseArgs(process.argv.slice(2))
    const files = walkDemosFolder(dir)
    console.log(`[ingest-demos] found ${files.length} .dem files under ${dir}`)
    const db = openWritableDb()
    const overrides = loadOverrides()
    console.log(`[ingest-demos] loaded ${overrides.size} manual overrides`)

    markWritePhase()
    await applyOverrides(db, overrides)
    const { ingested, skipped, reresolved, summary, failures } =
      await runDemoIngestion({ db, files, overrides, toornamentWindowHours })

    console.log(
      `[ingest-demos] done: ${ingested} parsed, ${skipped} already ingested, ${reresolved} re-resolved`
    )
    console.log(
      `[ingest-demos] player-match resolution — manual: ${summary.manual}, auto_high: ${summary.autoHigh}, auto_low (review): ${summary.autoLow}, ambiguous (review): ${summary.ambiguous}, unmatched (review): ${summary.unmatched}`
    )
    if (summary.autoLow + summary.ambiguous + summary.unmatched > 0) {
      console.log(
        `[ingest-demos] run \`sqlite3 data/sfl.db "select id, nickname, team_id from roster_entries where match_status != 'manual' and match_status != 'auto_high'"\` to review, then edit data/player-overrides.json and re-run.`
      )
    }
    const conflictRows = await db.all<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM matches WHERE team_resolution_conflict IS NOT NULL
    `)
    if (conflictRows[0]?.n > 0) {
      console.log(
        `[ingest-demos] ${conflictRows[0].n} match(es) have a team_resolution_conflict — run \`sqlite3 data/sfl.db "select id, file_name, team_resolution_conflict from matches where team_resolution_conflict is not null"\` to review.`
      )
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Some demos failed; earlier writes may have committed"
      )
  })
}

main().catch((err) => {
  console.error("[ingest-demos] failed:", err)
  process.exit(1)
})

import { sql } from "drizzle-orm"
import { openWritableDb } from "@/lib/db/client"
import { withCacheInvalidation } from "../cache/revalidate-cache"
import {
  isScrim,
  type CompletedToornamentMatch,
  type ScrimDemo,
} from "@/lib/scrim-detection"

type Database = Pick<ReturnType<typeof openWritableDb>, "all" | "run">

type DemoRow = ScrimDemo & { id: number; fileName: string; wasScrim: number }

/** Recomputes matches.is_scrim for every demo. Returns the rows that changed. */
export async function classifyScrims(database: Database, dryRun = false) {
  const completed = await database.all<CompletedToornamentMatch>(sql`
    SELECT scheduled_at AS scheduledAt, team_a_id AS teamAId,
      team_b_id AS teamBId, team_a_name_raw AS teamAName,
      team_b_name_raw AS teamBName
    FROM toornament_matches
    WHERE status = 'completed' AND scheduled_at IS NOT NULL
      AND team_a_score IS NOT NULL AND team_b_score IS NOT NULL
  `)
  const demos = await database.all<DemoRow>(sql`
    SELECT m.id, m.file_name AS fileName, m.demo_date AS demoDate,
      m.team_a_id AS teamAId, m.team_b_id AS teamBId,
      ta.name AS teamAName, tb.name AS teamBName, m.is_scrim AS wasScrim
    FROM matches m
    LEFT JOIN teams ta ON ta.id = m.team_a_id
    LEFT JOIN teams tb ON tb.id = m.team_b_id
  `)
  const changed = demos.flatMap((demo) => {
    const scrim = isScrim(demo, completed)
    return scrim === Boolean(demo.wasScrim) ? [] : [{ ...demo, scrim }]
  })
  if (!dryRun) {
    for (const { id, scrim } of changed) {
      await database.run(
        sql`UPDATE matches SET is_scrim = ${scrim ? 1 : 0} WHERE id = ${id}`
      )
    }
  }
  return { total: demos.length, changed }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const database = openWritableDb()
  const run = async (markWritePhase: () => void = () => {}) => {
    if (!dryRun) markWritePhase()
    const { total, changed } = await classifyScrims(database, dryRun)
    for (const c of changed) {
      console.log(
        `${dryRun ? "[dry-run] " : ""}${c.scrim ? "scrim" : "official"}: ${c.fileName}`
      )
    }
    console.log(`${changed.length} of ${total} demos changed`)
  }
  if (dryRun) await run()
  else await withCacheInvalidation("demos", run)
}

if (process.argv[1]?.endsWith("classify-scrims.ts")) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

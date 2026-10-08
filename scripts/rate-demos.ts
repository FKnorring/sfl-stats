import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { openWritableDb } from "@/lib/db/client"
import { matches, playerMatchStats } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { extractRatingFacts } from "@/lib/demo-rating"
import {
  persistRatingExtraction,
  recomputeMatchRatings,
  groupRatingFacts,
} from "@/lib/rating-db"

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      "match-id": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      recompute: { type: "boolean", default: false },
    },
  })
  const matchId =
    values["match-id"] === undefined ? undefined : Number(values["match-id"])
  if (
    matchId !== undefined &&
    (!Number.isSafeInteger(matchId) || matchId <= 0)
  ) {
    throw new Error("--match-id requires a positive integer")
  }
  const database = openWritableDb()
  try {
    const inventory = await database
      .select()
      .from(matches)
      .where(matchId === undefined ? undefined : eq(matches.id, matchId))
    if (!inventory.length)
      throw new Error("No demos match the requested inventory")
    const paths = new Map<string, string>()
    if (!values.recompute) {
      const dir = path.resolve(values.dir ?? process.env.DEMOS_DIR ?? "demos")
      if (!fs.existsSync(dir))
        throw new Error(`Demo folder does not exist: ${dir}`)
      for (const entry of fs.readdirSync(dir, {
        recursive: true,
        encoding: "utf8",
      })) {
        if (!entry.toLowerCase().endsWith(".dem")) continue
        const full = path.join(dir, entry)
        if (!fs.statSync(full).isFile()) continue
        const name = path.basename(entry).normalize("NFC")
        if (paths.has(name)) throw new Error(`Duplicate demo basename: ${name}`)
        paths.set(name, full)
      }
    }
    let failed = 0
    let rated = 0
    let missing = 0
    for (const match of inventory) {
      try {
        if (values.recompute) {
          const count = await recomputeMatchRatings(
            database,
            match.id,
            values["dry-run"]
          )
          rated += count
          console.log(
            `[rate-demos] ${match.id}: ${count} rated players (database facts)`
          )
          continue
        }
        const file = paths.get(match.fileName.normalize("NFC"))
        const extraction = file
          ? extractRatingFacts(file)
          : {
              rounds: [],
              facts: [],
              unavailableReason: "Original demo unavailable",
            }
        if (!file) missing++
        const count = values["dry-run"]
          ? groupRatingFacts(extraction.facts).size
          : await persistRatingExtraction(database, match.id, extraction)
        rated += count
        console.log(
          `[rate-demos] ${match.id}: ${count} rated players, ${extraction.rounds.length} rounds` +
            (extraction.unavailableReason
              ? `; ${extraction.unavailableReason}`
              : "")
        )
      } catch (error) {
        failed++
        console.error(
          `[rate-demos] failed demo ${match.id} (${match.fileName}):`,
          error
        )
        if (!values["dry-run"] && !values.recompute) {
          await persistRatingExtraction(database, match.id, {
            rounds: [],
            facts: [],
            unavailableReason: "Demo enrichment failed; inspect CLI error log",
          })
        }
      }
    }
    const stats = await database
      .select({
        rating: playerMatchStats.rating,
        reason: playerMatchStats.ratingUnavailableReason,
      })
      .from(playerMatchStats)
      .where(
        matchId === undefined
          ? undefined
          : eq(playerMatchStats.matchId, matchId)
      )
    const reasons = new Map<string, number>()
    for (const row of stats) {
      if (row.rating === null)
        reasons.set(
          row.reason ?? "Unknown",
          (reasons.get(row.reason ?? "Unknown") ?? 0) + 1
        )
    }
    console.log(
      `[rate-demos] ${values["dry-run"] ? "dry run: projected" : "persisted"} ${rated} player ratings; ` +
        `${inventory.length} demos, ${missing} missing files, ${failed} failures`
    )
    if (!values["dry-run"])
      console.log("[rate-demos] unrated:", Object.fromEntries(reasons))
    if (failed) process.exitCode = 1
  } finally {
    database.$client.close()
  }
}

main().catch((error) => {
  console.error("[rate-demos] failed:", error)
  process.exitCode = 1
})

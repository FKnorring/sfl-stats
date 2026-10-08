"use server"

import fs from "node:fs"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { openWritableDb } from "@/lib/db/client"
import { isLocalEnv } from "@/lib/env"
import { withCacheInvalidation } from "@/scripts/revalidate-cache"

const OVERRIDES_PATH = path.join(process.cwd(), "data", "player-overrides.json")

// Mirrors overridesFileSchema in scripts/ingest-demos.ts — kept in sync by
// hand since the app and the CLI script don't share a module graph.
const overridesFileSchema = z.record(
  z.string(),
  z.object({
    rosterEntryId: z.number(),
    note: z.string().optional(),
  })
)

const steamid64Schema = z
  .string()
  .trim()
  .regex(/^\d{17}$/, "Steam64 ID must be 17 digits")

export type OverrideSteamIdResult =
  { ok: true; message: string } | { ok: false; error: string }

/**
 * Local-only (ADR-0002): overwrites a roster entry's steamid64 in the DB and
 * records it in data/player-overrides.json, which scripts/ingest-demos.ts
 * applies with top priority on every run — so the manual value sticks.
 */
export async function overrideSteamId(
  rosterEntryId: number,
  steamid64Raw: string
): Promise<OverrideSteamIdResult> {
  if (!isLocalEnv) {
    return { ok: false, error: "Admin is only available when ENV=local" }
  }

  const parsed = steamid64Schema.safeParse(steamid64Raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid Steam64 ID",
    }
  }
  const steamid64 = parsed.data

  const db = openWritableDb()
  const entry = (await db.all(
    sql`SELECT nickname, matched_steamid64 AS previous FROM roster_entries WHERE id = ${rosterEntryId}`
  )) as { nickname: string; previous: string | null }[]
  if (entry.length === 0) return { ok: false, error: "Roster entry not found" }
  const { nickname } = entry[0]
  const now = new Date().toISOString()

  return withCacheInvalidation<OverrideSteamIdResult>(
    "demos",
    async (markWritePhase) => {
      markWritePhase()
      await db.transaction(async (tx) => {
        await tx.run(sql`
      INSERT INTO players (steamid64, latest_ingame_name, first_seen_at, last_seen_at)
      VALUES (${steamid64}, ${nickname}, ${now}, ${now})
      ON CONFLICT(steamid64) DO NOTHING
    `)
        await tx.run(sql`
      UPDATE roster_entries
      SET matched_steamid64 = ${steamid64}, match_confidence = 1, match_status = 'manual'
      WHERE id = ${rosterEntryId}
    `)
        await tx.run(sql`
      DELETE FROM player_name_overrides
      WHERE roster_entry_id = ${rosterEntryId} AND steamid64 != ${steamid64}
    `)
        await tx.run(sql`
      INSERT INTO player_name_overrides (steamid64, roster_entry_id, note, created_at)
      VALUES (${steamid64}, ${rosterEntryId}, NULL, ${now})
      ON CONFLICT(steamid64) DO UPDATE SET roster_entry_id = excluded.roster_entry_id
    `)
      })

      const overrides = fs.existsSync(OVERRIDES_PATH)
        ? overridesFileSchema.parse(
            JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"))
          )
        : {}
      for (const [id, o] of Object.entries(overrides)) {
        if (o.rosterEntryId === rosterEntryId && id !== steamid64) {
          delete overrides[id]
        }
      }
      overrides[steamid64] = {
        rosterEntryId,
        ...(overrides[steamid64]?.note
          ? { note: overrides[steamid64].note }
          : {}),
      }
      fs.writeFileSync(
        OVERRIDES_PATH,
        JSON.stringify(overrides, null, 2) + "\n",
        "utf-8"
      )

      revalidatePath("/admin")
      revalidatePath("/teams", "layout")
      revalidatePath(`/players/${steamid64}`)

      return { ok: true, message: "Saved" }
    }
  )
}

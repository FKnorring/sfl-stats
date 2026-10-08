"use server"

import { revalidatePath, updateTag } from "next/cache"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { getLivePendingMatches } from "@/lib/cached-toornament"
import { getCurrentSeason, getMatchTeams } from "@/lib/cached-data"
import { openWritableDb } from "@/lib/db/client"
import { isLocalEnv } from "@/lib/env"
import type { UpcomingMatchRow } from "@/lib/matches"
import { parseStreamMessage, type StreamAssignment } from "@/lib/stream-message"
import { enrichUpcomingMatches } from "@/lib/toornament-live"
import { withCacheInvalidation } from "@/scripts/revalidate-cache"
import { scopedCacheTag } from "@/lib/cache-policy"

const NOT_LOCAL = "Admin is only available when ENV=local"

export type ParseStreamsResult =
  | { ok: true; assignments: StreamAssignment[]; unmatched: string[] }
  | { ok: false; error: string }

async function loadUpcoming(): Promise<UpcomingMatchRow[] | null> {
  const [live, season] = await Promise.all([
    getLivePendingMatches(),
    getCurrentSeason(),
  ])
  if (live === null) return null
  return enrichUpcomingMatches(live, season ? await getMatchTeams(season) : [])
}

/** Local-only (ADR-0002): previews which upcoming matches a Discord message streams. */
export async function parseStreams(text: string): Promise<ParseStreamsResult> {
  if (!isLocalEnv) return { ok: false, error: NOT_LOCAL }
  const upcoming = await loadUpcoming()
  if (upcoming === null)
    return { ok: false, error: "Upcoming matches are unavailable right now" }
  return { ok: true, ...parseStreamMessage(text, upcoming) }
}

const assignmentsSchema = z.array(
  z.object({
    matchId: z.string().min(1),
    caster: z.string().max(100).nullable(),
    url: z
      .string()
      .regex(
        /^https:\/\/www\.twitch\.tv\/[a-z0-9_]{3,25}$/,
        "Not a Twitch channel URL"
      ),
  })
)

export type SaveStreamsResult =
  { ok: true; message: string } | { ok: false; error: string }

/** Local-only (ADR-0002): upserts the confirmed stream links. */
export async function saveStreams(
  assignments: { matchId: string; url: string; caster: string | null }[]
): Promise<SaveStreamsResult> {
  if (!isLocalEnv) return { ok: false, error: NOT_LOCAL }
  const parsed = assignmentsSchema.safeParse(assignments)
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid stream links",
    }
  if (parsed.data.length === 0) return { ok: false, error: "Nothing to save" }

  const db = openWritableDb()
  const now = new Date().toISOString()
  let wrote = false
  try {
    return await withCacheInvalidation<SaveStreamsResult>(
      "demos",
      async (markWritePhase) => {
        markWritePhase()
        wrote = true
        await db.transaction(async (tx) => {
          for (const { matchId, url, caster } of parsed.data)
            await tx.run(sql`
              INSERT INTO match_streams (toornament_match_id, stream_url, caster, created_at)
              VALUES (${matchId}, ${url}, ${caster}, ${now})
              ON CONFLICT(toornament_match_id) DO UPDATE SET stream_url = excluded.stream_url, caster = excluded.caster
            `)
        })
        return { ok: true, message: `Saved ${parsed.data.length} stream(s)` }
      }
    )
  } finally {
    db.$client.close()
    if (wrote) {
      updateTag(scopedCacheTag("db"))
      revalidatePath("/admin/streams")
      revalidatePath("/matches")
    }
  }
}

/** Local-only (ADR-0002): removes a stream link, e.g. after a mistake. */
export async function deleteStream(
  matchId: string
): Promise<SaveStreamsResult> {
  if (!isLocalEnv) return { ok: false, error: NOT_LOCAL }
  const db = openWritableDb()
  let wrote = false
  try {
    return await withCacheInvalidation<SaveStreamsResult>(
      "demos",
      async (markWritePhase) => {
        markWritePhase()
        wrote = true
        await db.run(
          sql`DELETE FROM match_streams WHERE toornament_match_id = ${matchId}`
        )
        return { ok: true, message: "Removed" }
      }
    )
  } finally {
    db.$client.close()
    if (wrote) {
      updateTag(scopedCacheTag("db"))
      revalidatePath("/admin/streams")
      revalidatePath("/matches")
    }
  }
}

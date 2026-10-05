"use server"

import fs from "node:fs"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { z } from "zod"

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

function loadOverridesFile(): Record<
  string,
  { rosterEntryId: number; note?: string }
> {
  if (!fs.existsSync(OVERRIDES_PATH)) return {}
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"))
  return overridesFileSchema.parse(raw)
}

export type CorrectRosterMatchResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

/**
 * Writes a manual steamid64 correction into the git-tracked
 * data/player-overrides.json, the same file scripts/ingest-demos.ts reads
 * on its next run. The app never writes to the SQLite DB directly (see
 * lib/db.ts) — this only edits the override file; a maintainer still needs
 * to run `pnpm ingest:demos` to apply it.
 */
export async function correctRosterMatch(
  teamNameForRevalidate: string,
  rosterEntryId: number,
  steamid64Raw: string,
  note?: string
): Promise<CorrectRosterMatchResult> {
  const parsed = steamid64Schema.safeParse(steamid64Raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Steam64 ID" }
  }
  const steamid64 = parsed.data

  const overrides = loadOverridesFile()
  overrides[steamid64] = {
    rosterEntryId,
    ...(note ? { note } : {}),
  }

  fs.writeFileSync(
    OVERRIDES_PATH,
    JSON.stringify(overrides, null, 2) + "\n",
    "utf-8"
  )

  revalidatePath(`/teams/${encodeURIComponent(teamNameForRevalidate)}`)

  return {
    ok: true,
    message:
      "Saved to data/player-overrides.json. Run `pnpm ingest:demos` to apply this correction to the roster.",
  }
}

"use server"

import { writeFile } from "node:fs/promises"
import { isLocalEnv } from "@/lib/env"
import { MAP_ZONES_PATH, type MapZones } from "@/lib/map-zones"

/**
 * Overwrites data/map-zones.json. Local-only authoring tool: refuses to run
 * unless ENV=local, per docs/adr/0002-public-app-is-read-only.md.
 */
export async function saveMapZones(zones: MapZones) {
  if (!isLocalEnv) {
    throw new Error("Zone editing is only available when ENV=local")
  }
  await writeFile(MAP_ZONES_PATH, JSON.stringify(zones, null, 2) + "\n")
}

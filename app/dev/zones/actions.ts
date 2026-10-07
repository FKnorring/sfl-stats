"use server"

import { writeFile } from "node:fs/promises"
import { MAP_ZONES_PATH, type MapZones } from "@/lib/map-zones"

/**
 * Overwrites data/map-zones.json. Local-only authoring tool: refuses to run
 * outside `next dev`, per docs/adr/0002-public-app-is-read-only.md.
 */
export async function saveMapZones(zones: MapZones) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Zone editing is only available in next dev")
  }
  await writeFile(MAP_ZONES_PATH, JSON.stringify(zones, null, 2) + "\n")
}

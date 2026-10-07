import { readFile } from "node:fs/promises"
import path from "node:path"

// Hand-drawn, labelled regions per map, in the same 1024px radar image space
// as MapRadar (x right, y down). Authored with the dev-only page at
// /dev/zones and stored in data/map-zones.json.
export type MapZone = {
  label: string
  points: [number, number][]
}

export type MapZones = Record<string, MapZone[]>

export const MAP_ZONES_PATH = path.join(process.cwd(), "data", "map-zones.json")

export async function readMapZones(): Promise<MapZones> {
  try {
    return JSON.parse(await readFile(MAP_ZONES_PATH, "utf8")) as MapZones
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw e
  }
}

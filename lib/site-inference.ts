import type { PlayerKillRow } from "@/lib/db"
import type { MapRadar } from "@/lib/map-images"
import type { MapZone, MapZones } from "@/lib/map-zones"
import zonesJson from "@/data/map-zones.json"

// Which bombsite (or mid) a player most likely holds, judged from where they
// got their kills while playing CT. Zones are the polygons drawn in
// /dev/zones, in 1024px radar image space (see MapRadar). A CT kill outside
// every zone (spawn, rotations) counts toward the player's total but toward
// no zone. Maps with no drawn zones (Nuke) are not inferred.
const MAP_ZONES = zonesJson as unknown as MapZones

type Spot = string

function inPolygon(x: number, y: number, pts: MapZone["points"]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

export type SiteGuess =
  | { kind: "unsupported" }
  | {
      kind: "guess"
      site: Spot | null
      confidence: "high" | "low" | "none"
      siteKills: number
      ctKills: number
    }

// Thresholds on kills that landed inside a site zone.
const MIN_SITE_KILLS = 4
const HIGH_SITE_KILLS = 8
const HIGH_SHARE = 0.7
const LOW_SHARE = 0.55
// If less than this share of CT kills are at a site, the player is more of
// a mid/rotating player and no site is a fair answer.
const MIN_SITE_COVERAGE = 0.4

export function inferCtSite(
  kills: PlayerKillRow[],
  steamid64: string,
  mapName: string,
  radar: MapRadar
): SiteGuess {
  const zones = MAP_ZONES[mapName]
  if (!zones?.length) return { kind: "unsupported" }

  const counts: Record<Spot, number> = {}
  let ctKills = 0
  for (const k of kills) {
    if (
      k.mapName !== mapName ||
      k.attackerSteamid64 !== steamid64 ||
      k.attackerSide !== "CT" ||
      k.attackerX == null ||
      k.attackerY == null
    )
      continue
    ctKills++
    const px = (k.attackerX - radar.originX) / radar.scale
    const py = (radar.originY - k.attackerY) / radar.scale
    const zone = zones.find((z) => inPolygon(px, py, z.points))
    if (zone) counts[zone.label] = (counts[zone.label] ?? 0) + 1
  }

  const entries = Object.entries(counts).sort((x, y) => y[1] - x[1])
  const siteKills = entries.reduce((n, [, c]) => n + c, 0)
  const top = entries[0]?.[0] ?? ""
  const share = siteKills > 0 ? (counts[top] ?? 0) / siteKills : 0
  const covered = ctKills > 0 && siteKills / ctKills >= MIN_SITE_COVERAGE

  let confidence: "high" | "low" | "none" = "none"
  if (covered && siteKills >= MIN_SITE_KILLS) {
    if (siteKills >= HIGH_SITE_KILLS && share >= HIGH_SHARE) confidence = "high"
    else if (share >= LOW_SHARE) confidence = "low"
  }
  return {
    kind: "guess",
    site: confidence === "none" ? null : top,
    confidence,
    siteKills,
    ctKills,
  }
}

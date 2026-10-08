import { notFound } from "next/navigation"
import { connection } from "next/server"
import { isLocalEnv } from "@/lib/env"
import { readMapZones } from "@/lib/map-zones"
import { getMapRadar } from "@/lib/map-images"
import { ZoneEditor } from "./zone-editor"

const MAPS = [
  "de_ancient",
  "de_anubis",
  "de_cache",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
]

// Local-only authoring tool (ADR-0002): 404s unless ENV=local.
export default async function ZonesPage() {
  if (!isLocalEnv) notFound()

  await connection()
  const zones = await readMapZones()
  const radars = Object.fromEntries(
    MAPS.flatMap((m) => {
      const r = getMapRadar(m)
      return r ? [[m, r.url]] : []
    })
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Map zones</h1>
      <ZoneEditor initialZones={zones} radars={radars} />
    </div>
  )
}

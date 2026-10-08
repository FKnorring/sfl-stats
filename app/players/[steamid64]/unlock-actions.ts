"use server"

import { timingSafeEqual, createHash } from "node:crypto"
import { getPlayerKills, getPlayerMatchHistory } from "@/lib/cached-data"
import { isNetlightTeam } from "@/components/netlight-flames"
import { getMapRadar, type MapRadar } from "@/lib/map-images"
import type { PlayerKillRow } from "@/lib/db"

export type UnlockResult =
  | { ok: true; kills: PlayerKillRow[]; radars: Record<string, MapRadar> }
  | { ok: false }

const digest = (s: string) => createHash("sha256").update(s).digest()

// The password lives only in server env (NETLIGHT_HEATMAP_PASSWORD), so it
// never reaches the client bundle, and the heatmap data is only ever sent
// after a correct guess. Unset env fails closed.
export async function unlockNetlightHeatmap(
  steamid64: string,
  password: string
): Promise<UnlockResult> {
  const expected = process.env.NETLIGHT_HEATMAP_PASSWORD
  if (!expected || typeof password !== "string") return { ok: false }
  if (!timingSafeEqual(digest(password), digest(expected))) return { ok: false }

  const history = await getPlayerMatchHistory(steamid64)
  if (!history.some((m) => isNetlightTeam(m.teamName))) return { ok: false }

  const kills = (await getPlayerKills(steamid64)).filter(
    (k) => getMapRadar(k.mapName) != null
  )
  const radars = Object.fromEntries(
    [...new Set(kills.map((k) => k.mapName))].flatMap((m) => {
      const r = getMapRadar(m)
      return r ? [[m, r]] : []
    })
  )
  return { ok: true, kills, radars }
}

"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PlayerKillRow } from "@/lib/db"
import type { MapRadar } from "@/lib/map-images"
import {
  Heatmap,
  ToggleGroup,
} from "../../matches/demo/[matchId]/player-heatmaps"

type Mode = "kills" | "deaths"
type SideFilter = "all" | "T" | "CT"

export function PlayerMapHeatmap({
  steamid64,
  kills,
  radars,
}: {
  steamid64: string
  kills: PlayerKillRow[]
  radars: Record<string, MapRadar>
}) {
  const maps = useMemo(
    () => [...new Set(kills.map((k) => k.mapName))].sort(),
    [kills]
  )
  const [map, setMap] = useState<string | null>(maps[0] ?? null)
  const [mode, setMode] = useState<Mode>("kills")
  const [side, setSide] = useState<SideFilter>("all")

  const radar = map ? radars[map] : null
  const points = useMemo(() => {
    if (!radar || !map) return []
    const out: { x: number; y: number }[] = []
    for (const k of kills) {
      if (k.mapName !== map) continue
      const own =
        mode === "kills"
          ? k.attackerSteamid64 === steamid64
          : k.victimSteamid64 === steamid64
      if (!own) continue
      if (
        side !== "all" &&
        (mode === "kills" ? k.attackerSide : k.victimSide) !== side
      )
        continue
      const x = mode === "kills" ? k.attackerX : k.victimX
      const y = mode === "kills" ? k.attackerY : k.victimY
      if (x == null || y == null) continue
      out.push({
        x: (x - radar.originX) / radar.scale,
        y: (radar.originY - y) / radar.scale,
      })
    }
    return out
  }, [kills, map, mode, side, radar, steamid64])

  if (!map || !radar) {
    return (
      <div className="flex min-w-80 flex-1 items-center justify-center rounded-md border border-border p-6 text-sm text-muted-foreground">
        No kill positions for this player.
      </div>
    )
  }

  return (
    <div className="flex min-w-80 flex-1 flex-col gap-3 rounded-md border border-border p-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Select value={map} onValueChange={(v) => v && setMap(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Map" />
          </SelectTrigger>
          <SelectContent>
            {maps.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          options={["kills", "deaths"] as const}
          value={mode}
          onChange={setMode}
          label={(m) => m}
        />
        <ToggleGroup
          options={["all", "T", "CT"] as const}
          value={side}
          onChange={setSide}
          label={(s) => (s === "all" ? "Both sides" : `${s}-side`)}
        />
      </div>
      <span className="text-sm text-muted-foreground">
        {points.length} {mode}
        {side === "all" ? "" : ` as ${side}`}
      </span>
      <Heatmap
        points={points}
        imageUrl={radar.url}
        isRadar
        className="mx-auto max-w-[min(100%,36rem)]"
      />
    </div>
  )
}

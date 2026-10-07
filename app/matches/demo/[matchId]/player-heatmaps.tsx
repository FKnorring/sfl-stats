"use client"

import { useEffect, useRef, useState } from "react"
import type { MatchKillRow } from "@/lib/db"
import type { MapRadar } from "@/lib/map-images"

type Mode = "kills" | "deaths"
type SideFilter = "all" | "T" | "CT"
type Point = { x: number; y: number }

const VIEW = 1024
const PAD = 40

// With a radar, world coordinates map straight onto the 1024px image using
// the map's calibration. Without one, points are fit to the bounding box of
// every position in the match, so they're only relative to each other.
function makeProjector(kills: MatchKillRow[], radar: MapRadar | null) {
  if (radar) {
    return (x: number, y: number) => ({
      x: (x - radar.originX) / radar.scale,
      y: (radar.originY - y) / radar.scale,
    })
  }
  const xs: number[] = []
  const ys: number[] = []
  for (const k of kills) {
    for (const [x, y] of [
      [k.attackerX, k.attackerY],
      [k.victimX, k.victimY],
    ]) {
      if (x != null && y != null) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  // One scale for both axes so the layout isn't stretched.
  const scale = (VIEW - 2 * PAD) / Math.max(maxX - minX, maxY - minY, 1)
  return (x: number, y: number) => ({
    // Game Y grows upward, SVG Y grows downward.
    x: PAD + (x - minX) * scale,
    y: VIEW - PAD - (y - minY) * scale,
  })
}

// Density grid resolution (the canvas is CSS-scaled up to the radar, which
// smooths it) and the Gaussian spread of one kill, both in grid cells.
const GRID = 256
const SIGMA = 4.5
// A lone kill should read as "cool", not as the hottest spot on the map, so
// the color scale never normalises below this many stacked kills.
const MIN_PEAK = 2

// Cool-to-hot ramp: blue -> cyan -> green -> yellow -> red.
const RAMP: [number, number, number][] = [
  [30, 60, 255],
  [0, 220, 255],
  [40, 230, 80],
  [255, 230, 0],
  [255, 40, 0],
]

function rampColor(t: number): [number, number, number] {
  const f = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1)
  const i = Math.min(Math.floor(f), RAMP.length - 2)
  const m = f - i
  return [0, 1, 2].map((c) =>
    Math.round(RAMP[i][c] + (RAMP[i + 1][c] - RAMP[i][c]) * m)
  ) as [number, number, number]
}

function drawDensity(canvas: HTMLCanvasElement, points: Point[]) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const density = new Float32Array(GRID * GRID)
  const reach = Math.ceil(SIGMA * 3)
  const k = GRID / VIEW
  for (const p of points) {
    const cx = p.x * k
    const cy = p.y * k
    for (
      let y = Math.max(0, Math.floor(cy) - reach);
      y <= Math.min(GRID - 1, Math.floor(cy) + reach);
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(cx) - reach);
        x <= Math.min(GRID - 1, Math.floor(cx) + reach);
        x++
      ) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
        density[y * GRID + x] += Math.exp(-d2 / (2 * SIGMA * SIGMA))
      }
    }
  }
  let peak = MIN_PEAK
  for (const v of density) if (v > peak) peak = v

  const img = ctx.createImageData(GRID, GRID)
  for (let i = 0; i < density.length; i++) {
    const t = density[i] / peak
    // Fade the coolest values out so empty areas stay clear.
    const alpha = Math.min(1, t * 4)
    if (alpha < 0.03) continue
    const [r, g, b] = rampColor(t)
    img.data.set([r, g, b, Math.round(alpha * 190)], i * 4)
  }
  ctx.putImageData(img, 0, 0)
}

export function Heatmap({
  points,
  imageUrl,
  isRadar,
  className = "max-w-xl",
}: {
  className?: string
  points: Point[]
  imageUrl: string | null
  isRadar: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current) drawDensity(canvasRef.current, points)
  }, [points])

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted ${className}`}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-0 size-full"
      >
        {imageUrl ? (
          <image
            href={imageUrl}
            width={VIEW}
            height={VIEW}
            preserveAspectRatio="xMidYMid slice"
            opacity={isRadar ? 1 : 0.35}
          />
        ) : null}
      </svg>
      <canvas
        ref={canvasRef}
        width={GRID}
        height={GRID}
        className="absolute inset-0 size-full"
        role="img"
        aria-label="Heatmap"
      />
    </div>
  )
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[]
  value: T
  onChange: (next: T) => void
  label: (option: T) => string
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-md px-3 py-1 text-sm capitalize transition-colors ${value === o ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )
}

export function PlayerHeatmaps({
  steamid64,
  playerName,
  kills,
  hidden = false,
  mapImageUrl,
  radar,
}: {
  steamid64: string | null
  playerName: string | null
  kills: MatchKillRow[]
  hidden?: boolean
  mapImageUrl: string | null
  radar: MapRadar | null
}) {
  const [mode, setMode] = useState<Mode>("kills")
  const [side, setSide] = useState<SideFilter>("all")
  if (hidden) {
    return (
      <p className="text-sm text-muted-foreground">
        Det här hade du velat veta va? 😉
      </p>
    )
  }
  if (!steamid64 || kills.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No kill positions for this match.
      </p>
    )
  }
  const fit = makeProjector(kills, radar)
  function pointsFor(steamid64: string): Point[] {
    const out: Point[] = []
    for (const k of kills) {
      const own =
        mode === "kills"
          ? k.attackerSteamid64 === steamid64
          : k.victimSteamid64 === steamid64
      if (!own) continue
      const ownSide = mode === "kills" ? k.attackerSide : k.victimSide
      if (side !== "all" && ownSide !== side) continue
      // Kills are plotted where the player stood when they got the kill;
      // deaths where they died.
      const x = mode === "kills" ? k.attackerX : k.victimX
      const y = mode === "kills" ? k.attackerY : k.victimY
      if (x == null || y == null) continue
      out.push(fit(x, y))
    }
    return out
  }

  const points = pointsFor(steamid64)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
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
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {playerName ? `${playerName}: ` : ""}
          {points.length} {mode}
          {side === "all" ? "" : ` as ${side}`}
        </span>
        <Heatmap
          points={points}
          imageUrl={radar?.url ?? mapImageUrl}
          isRadar={radar != null}
        />
      </div>
    </div>
  )
}

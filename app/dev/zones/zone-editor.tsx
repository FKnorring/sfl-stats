"use client"

import { useState, useTransition } from "react"
import type { MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MapZone, MapZones } from "@/lib/map-zones"
import { saveMapZones } from "./actions"

const VIEW = 1024
const COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#06b6d4",
]
const SUGGESTED_LABELS = ["A", "B", "Mid"]

const toPoints = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${x},${y}`).join(" ")

export function ZoneEditor({
  initialZones,
  radars,
}: {
  initialZones: MapZones
  radars: Record<string, string>
}) {
  const maps = Object.keys(radars)
  const [map, setMap] = useState(maps[0])
  const [zones, setZones] = useState<MapZones>(initialZones)
  const [label, setLabel] = useState("A")
  const [draft, setDraft] = useState<[number, number][]>([])
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const mapZones = zones[map] ?? []
  const colorFor = (l: string) => {
    const labels = [...new Set(mapZones.map((z) => z.label).concat(label))]
    return COLORS[labels.indexOf(l) % COLORS.length]
  }

  function update(next: MapZone[]) {
    setZones({ ...zones, [map]: next })
    setDirty(true)
    setStatus(null)
  }

  function addPoint(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setDraft([
      ...draft,
      [
        Math.round(((e.clientX - rect.left) / rect.width) * VIEW),
        Math.round(((e.clientY - rect.top) / rect.height) * VIEW),
      ],
    ])
  }

  function closeDraft() {
    if (draft.length < 3 || !label.trim()) return
    update([...mapZones, { label: label.trim(), points: draft }])
    setDraft([])
  }

  function save() {
    startTransition(async () => {
      try {
        await saveMapZones(zones)
        setDirty(false)
        setStatus("Saved to data/map-zones.json")
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Save failed")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-80 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Select
            value={map}
            onValueChange={(v) => {
              if (!v) return
              setMap(v)
              setDraft([])
            }}
          >
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
          {SUGGESTED_LABELS.map((l) => (
            <Button
              key={l}
              size="sm"
              variant={label === l ? "default" : "outline"}
              onClick={() => setLabel(l)}
            >
              {l}
            </Button>
          ))}
          <Input
            className="w-32"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Custom label"
          />
          <Button
            size="sm"
            onClick={closeDraft}
            disabled={draft.length < 3 || !label.trim()}
          >
            Close shape
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft(draft.slice(0, -1))}
            disabled={draft.length === 0}
          >
            Undo point
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft([])}
            disabled={draft.length === 0}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {status && <span className="text-muted-foreground">{status}</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          Set a label, click around an area to outline it, then Close shape.
          Reusing a label adds another region to the same zone.
        </p>
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="w-full max-w-3xl cursor-crosshair rounded-md border border-border"
          onClick={addPoint}
        >
          {}
          <image href={radars[map]} width={VIEW} height={VIEW} />
          {mapZones.map((z, i) => (
            <g key={i}>
              <polygon
                points={toPoints(z.points)}
                fill={colorFor(z.label)}
                fillOpacity={0.3}
                stroke={colorFor(z.label)}
                strokeWidth={2}
                pointerEvents="none"
              />
              <text
                x={z.points.reduce((s, p) => s + p[0], 0) / z.points.length}
                y={z.points.reduce((s, p) => s + p[1], 0) / z.points.length}
                textAnchor="middle"
                fill="white"
                stroke="black"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize={28}
                fontWeight={700}
                pointerEvents="none"
              >
                {z.label}
              </text>
            </g>
          ))}
          {draft.length > 0 && (
            <g pointerEvents="none">
              <polyline
                points={toPoints(draft)}
                fill={colorFor(label)}
                fillOpacity={0.2}
                stroke={colorFor(label)}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              {draft.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={4} fill={colorFor(label)} />
              ))}
            </g>
          )}
        </svg>
      </div>

      <div className="flex min-w-60 flex-col gap-2 text-sm">
        <h2 className="font-medium text-muted-foreground">
          {map} ({mapZones.length})
        </h2>
        {mapZones.length === 0 && (
          <span className="text-muted-foreground">No zones yet.</span>
        )}
        {mapZones.map((z, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-3 rounded-sm"
              style={{ background: colorFor(z.label) }}
            />
            <span className="flex-1">
              {z.label}{" "}
              <span className="text-muted-foreground">
                ({z.points.length} pts)
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update(mapZones.filter((_, j) => j !== i))}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import type { MatchKillRow } from "@/lib/db"
import type { MapRadar } from "@/lib/map-images"
import type { DemoMatchPlayerRow } from "./columns"
import { DemoMatchTable } from "./demo-match-table"
import { PlayerHeatmaps } from "./player-heatmaps"

function TeamHeading({ name, score }: { name: string; score: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/teams/${encodeURIComponent(name)}`}
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        {name}
      </Link>
      {score != null ? (
        <span className="text-sm font-medium tabular-nums">{score}</span>
      ) : null}
    </div>
  )
}

// Owns the selected player so a click on a scoreboard row drives the
// heatmap beside it.
export function DemoMatchView({
  teamA,
  teamB,
  kills,
  hiddenSteamids,
  mapImageUrl,
  radar,
}: {
  teamA: { name: string; score: number | null; players: DemoMatchPlayerRow[] }
  teamB: { name: string; score: number | null; players: DemoMatchPlayerRow[] }
  kills: MatchKillRow[]
  hiddenSteamids: string[]
  mapImageUrl: string | null
  radar: MapRadar | null
}) {
  const all = [...teamA.players, ...teamB.players]
  const [selected, setSelected] = useState<string | null>(
    all[0]?.steamid64 ?? null
  )
  const current = all.find((p) => p.steamid64 === selected) ?? null

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        {[teamA, teamB].map((team) => (
          <div key={team.name} className="flex flex-col gap-2">
            <TeamHeading name={team.name} score={team.score} />
            <DemoMatchTable
              rows={team.players}
              selectedSteamid64={selected}
              onSelect={setSelected}
            />
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-medium">Player heatmap</h2>
        <PlayerHeatmaps
          steamid64={current?.steamid64 ?? null}
          playerName={current?.inGameName ?? null}
          kills={kills}
          hidden={current != null && hiddenSteamids.includes(current.steamid64)}
          mapImageUrl={mapImageUrl}
          radar={radar}
        />
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import type { MatchKillRow } from "@/lib/db"
import type { MapRadar } from "@/lib/map-images"
import type { DemoMatchPlayerRow } from "./columns"
import { DemoMatchTable } from "./demo-match-table"
import { PlayerHeatmaps } from "./player-heatmaps"
import { RatingValue, RatingExplanation } from "@/components/player-rating"
import { RATING_WEIGHTS, type PlayerRatingSummary } from "@/lib/player-rating"

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
  unassignedPlayers = [],
  kills,
  hiddenSteamids,
  mapImageUrl,
  radar,
  ratingDetails = {},
}: {
  teamA: { name: string; score: number | null; players: DemoMatchPlayerRow[] }
  teamB: { name: string; score: number | null; players: DemoMatchPlayerRow[] }
  unassignedPlayers?: DemoMatchPlayerRow[]
  kills: MatchKillRow[]
  hiddenSteamids: string[]
  mapImageUrl: string | null
  radar: MapRadar | null
  ratingDetails?: Record<string, PlayerRatingSummary>
}) {
  const all = [...teamA.players, ...teamB.players, ...unassignedPlayers]
  const [selected, setSelected] = useState<string | null>(
    all[0]?.steamid64 ?? null
  )
  const current = all.find((p) => p.steamid64 === selected) ?? null
  const rating =
    current?.rating != null ? ratingDetails[current.steamid64] : undefined

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
        {unassignedPlayers.length ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Unassigned players</h2>
            <p className="text-xs text-muted-foreground">
              Team evidence is ambiguous; these players cannot be assigned
              safely.
            </p>
            <DemoMatchTable
              rows={unassignedPlayers}
              selectedSteamid64={selected}
              onSelect={setSelected}
            />
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {current ? (
          <section
            className="mb-4 rounded-md border border-border p-4 text-sm"
            aria-label="Player rating breakdown"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">
                {current.inGameName} · SFL Rating v1
              </h2>
              <RatingValue
                rating={current.rating}
                reason={current.ratingUnavailableReason}
              />
            </div>
            {rating ? (
              <>
                <dl className="my-3 grid grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(rating.components).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="capitalize">{key}</dt>
                      <dd className="tabular-nums">
                        {value.toFixed(2)} ×{" "}
                        {RATING_WEIGHTS[key as keyof typeof RATING_WEIGHTS] *
                          100}
                        %
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mb-2 text-xs text-muted-foreground">
                  {rating.rounds} participated rounds · KAST{" "}
                  {(rating.kast * 100).toFixed(1)}%{" · "}Openings{" "}
                  {rating.openingKills}/{rating.openingDeaths}
                  {" · "}
                  {rating.clutchWins} clutch wins · {rating.flashAssists} flash
                  assists
                  {" · "}
                  {rating.utilityDamage} utility damage
                </p>
              </>
            ) : (
              <p className="my-2 text-xs text-muted-foreground">
                {current.ratingUnavailableReason ??
                  "No eligible current-version rating"}
              </p>
            )}
            <RatingExplanation />
          </section>
        ) : null}
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

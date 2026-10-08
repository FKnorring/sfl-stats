"use client"

import { useState } from "react"
import Link from "next/link"
import type { PlayerCardData } from "@/app/api/players/[steamid64]/card/route"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileLinks } from "@/components/profile-links"
import { RatingValue } from "@/components/player-rating"

// Module-level so re-hovering (or the same player in several tables) doesn't
// refetch within a page session.
const cache = new Map<string, Promise<PlayerCardData | null>>()

function loadCard(steamid64: string): Promise<PlayerCardData | null> {
  let p = cache.get(steamid64)
  if (!p) {
    p = fetch(`/api/players/${encodeURIComponent(steamid64)}/card`)
      .then((r) => (r.ok ? (r.json() as Promise<PlayerCardData>) : null))
      .catch(() => null)
    // Don't pin failures for the rest of the session.
    p.then((d) => {
      if (!d) cache.delete(steamid64)
    })
    cache.set(steamid64, p)
  }
  return p
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" })
}

function CardBody({ data }: { data: PlayerCardData }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small, variable-source external avatar, same tradeoff as team logos
          <img
            src={data.avatarUrl}
            alt=""
            className="size-14 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="size-14 rounded-md border border-border bg-muted" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{data.inGameName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {data.realName ?? "😂"}
          </span>
          {data.teamName ? (
            <span className="truncate text-xs text-muted-foreground">
              {data.teamName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <ProfileLinks
          steamid64={data.steamid64}
          faceitNickname={data.faceit?.nickname}
        />
        {data.faceit?.elo != null ? (
          <Badge variant="outline">{data.faceit.elo} elo</Badge>
        ) : null}
        {data.faceit?.skillLevel != null ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs from /public
          <img
            src={`/faceit-levels/${data.faceit.skillLevel}.svg`}
            alt={`Faceit level ${data.faceit.skillLevel}`}
            title={`Faceit level ${data.faceit.skillLevel}`}
            className="size-6"
          />
        ) : null}
        {!data.faceit ? (
          <span className="text-xs">No Faceit profile</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Recent games
        </span>
        {data.recentGames.length === 0 ? (
          <span className="text-xs text-muted-foreground">No demos yet</span>
        ) : (
          <ul className="flex flex-col gap-0.5 text-xs">
            {data.recentGames.map((g) => (
              <li key={g.matchId}>
                <Link
                  href={`/matches/demo/${g.matchId}`}
                  className="grid grid-cols-[3rem_1fr_auto] gap-2 rounded px-1 py-0.5 hover:bg-muted"
                >
                  <span className="text-muted-foreground">
                    {formatDate(g.demoDate)}
                  </span>
                  <span className="truncate">
                    {g.mapName?.replace(/^de_/, "") ?? "?"}
                    {g.opponentTeamName ? ` vs ${g.opponentTeamName}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {g.kills}/{g.deaths}/{g.assists}
                    {" · SFL "}
                    <RatingValue
                      rating={g.rating}
                      reason={g.ratingUnavailableReason}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

/**
 * Wraps a trigger element (typically a whole table row) in a hover card showing their
 * Steam avatar/links, Faceit elo, real name and recent games. Data is fetched
 * on first open.
 */
export function PlayerHoverCard({
  steamid64,
  children,
}: {
  steamid64: string
  /** The element that triggers the card, e.g. a whole table row. */
  children: React.ReactElement
}) {
  const [data, setData] = useState<PlayerCardData | null>(null)
  const [failed, setFailed] = useState(false)

  function onOpenChange(open: boolean) {
    if (!open || data) return
    setFailed(false)
    loadCard(steamid64).then((d) => {
      if (d) setData(d)
      else setFailed(true)
    })
  }

  return (
    <HoverCard onOpenChange={onOpenChange}>
      <HoverCardTrigger render={children} delay={250} closeDelay={100} />
      <HoverCardContent className="w-80" side="bottom" align="start">
        {data ? (
          <CardBody data={data} />
        ) : failed ? (
          <span className="text-xs text-muted-foreground">
            Couldn&apos;t load profile.
          </span>
        ) : (
          <CardSkeleton />
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

import Link from "next/link"
import {
  currentRoundIndex,
  type BracketData,
  type BracketMatch,
  type BracketSlot,
} from "@/lib/toornament/bracket"
import { cn } from "@/lib/utils"

const TIME_ZONE = "Europe/Stockholm"
const WIDGET_ORIGIN = "https://widget.toornament.com"

/** Toornament parks unscheduled matches at local midnight. */
function formatWhen(iso: string | null) {
  if (!iso) return "Time TBD"
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return time === "00:00" ? `${day} · time TBD` : `${day} · ${time}`
}

function Team({
  slot,
  teamNames,
}: {
  slot: BracketSlot
  teamNames: Record<string, string>
}) {
  const known = slot.name !== null
  const linked = slot.name ? teamNames[slot.name] : undefined
  return (
    <div
      className={cn(
        "flex h-1/2 min-h-0 items-center gap-1.5 px-1.5",
        slot.result === "loss" && "text-muted-foreground",
        slot.result === "win" && "font-medium"
      )}
    >
      {slot.logoPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- small external team logos
        <img
          src={`${WIDGET_ORIGIN}${slot.logoPath}`}
          alt=""
          className="size-4 shrink-0 rounded-sm object-contain"
        />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {linked ? (
        <Link
          href={`/teams/team/${encodeURIComponent(linked)}`}
          className="min-w-0 flex-1 truncate hover:underline"
          title={slot.name ?? undefined}
        >
          {slot.name}
        </Link>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !known && "text-muted-foreground italic"
          )}
          title={slot.name ?? undefined}
        >
          {slot.name ?? "TBD"}
        </span>
      )}
      <span className="w-3 shrink-0 text-right font-mono tabular-nums">
        {slot.score ?? ""}
      </span>
    </div>
  )
}

function MatchCard({
  match,
  teamNames,
}: {
  match: BracketMatch
  teamNames: Record<string, string>
}) {
  return (
    <div
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-md border bg-card text-xs",
        match.status === "pending" && "border-primary/60",
        match.status === "waiting" && "border-dashed"
      )}
      style={{
        left: `${match.x}rem`,
        top: `${match.y}rem`,
        width: `${match.width}rem`,
        height: `${match.height}rem`,
      }}
    >
      <Team slot={match.teamA} teamNames={teamNames} />
      <div className="border-t" />
      <Team slot={match.teamB} teamNames={teamNames} />
    </div>
  )
}

export function BracketView({
  season,
  sourceUrl,
  bracket,
  teamNames,
}: {
  season: string
  sourceUrl: string
  bracket: BracketData
  teamNames: Record<string, string>
}) {
  const current = currentRoundIndex(bracket)
  const byId = new Map(bracket.matches.map((m) => [m.id, m]))
  const upcoming = bracket.matches
    .filter((m) => m.status === "pending")
    .sort(
      (a, b) =>
        (a.scheduledAt ?? "9").localeCompare(b.scheduledAt ?? "9") ||
        a.round - b.round
    )
  const champion = (() => {
    const final = bracket.matches.find(
      (m) => m.nextMatchId === null && m.round === bracket.rounds.length - 1
    )
    if (final?.status !== "completed") return null
    return final.teamA.result === "win" ? final.teamA : final.teamB
  })()

  const roundMatches = (round: number) =>
    bracket.matches.filter((m) => m.round === round)

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6">
      <div>
        <h1 className="text-sm font-medium">Playoffs</h1>
        <p className="text-xs text-muted-foreground">
          {season} · Counter-Strike 2
          {champion
            ? ` · Champion: ${champion.name}`
            : current !== null
              ? ` · Now: ${bracket.rounds[current]}`
              : ""}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase">
          Round progress
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {bracket.rounds.map((title, round) => {
            const matches = roundMatches(round)
            const played = matches.filter(
              (m) => m.status === "completed"
            ).length
            return (
              <li
                key={title}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-xs",
                  round === current && "border-primary/60"
                )}
              >
                <span>{title}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {played}/{matches.length}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {upcoming.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase">
            Up next
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-44 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatWhen(m.scheduledAt)}
                </span>
                <span>
                  {m.teamA.name}{" "}
                  <span className="text-muted-foreground">vs</span>{" "}
                  {m.teamB.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {bracket.rounds[m.round]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase">
          Bracket
        </h2>
        <div className="overflow-x-auto pb-2">
          <div
            className="relative"
            style={{ width: `${bracket.width}rem`, paddingTop: "2rem" }}
          >
            {bracket.rounds.map((title, round) => {
              const first = roundMatches(round)[0]
              return first ? (
                <div
                  key={title}
                  className={cn(
                    "absolute top-0 text-xs text-muted-foreground",
                    round === current && "font-medium text-foreground"
                  )}
                  style={{ left: `${first.x}rem`, width: `${first.width}rem` }}
                >
                  {title}
                </div>
              ) : null
            })}
            <div
              className="relative"
              style={{
                width: `${bracket.width}rem`,
                height: `${bracket.height}rem`,
              }}
            >
              <svg
                className="absolute inset-0 text-border"
                style={{
                  width: `${bracket.width}rem`,
                  height: `${bracket.height}rem`,
                }}
                viewBox={`0 0 ${bracket.width} ${bracket.height}`}
                aria-hidden
              >
                {bracket.links.map((link, i) => (
                  <polyline
                    key={i}
                    points={link.points.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={0.08}
                    className={link.decided ? "text-primary/70" : undefined}
                  />
                ))}
              </svg>
              {bracket.matches.map((m) => (
                <MatchCard key={m.id} match={m} teamNames={teamNames} />
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {byId.size} matches · times in Stockholm ·{" "}
          <a
            href={sourceUrl}
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Toornament
          </a>
        </p>
      </section>
    </div>
  )
}

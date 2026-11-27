import Link from "next/link"
import type { TeamLineup } from "@/lib/db"
import {
  currentRoundIndex,
  type MatchPreview,
  type PreviewSide,
  type BracketData,
  type BracketMatch,
  type BracketSlot,
} from "@/lib/toornament/bracket"
import { formatMapName, getMapIconUrl } from "@/lib/maps/map-images"
import { RatingValue } from "@/components/player-rating"
import { cn } from "@/lib/utils"

const TIME_ZONE = "Europe/Stockholm"
const WIDGET_ORIGIN = "https://widget.toornament.com"

/** Semifinals are confirmed for 12:00 even while Toornament shows no time. */
const SEMIFINAL_TIME = "12:00"
const confirmedTime = (title: string | undefined) =>
  title && /semi/i.test(title) ? SEMIFINAL_TIME : undefined

/** Toornament parks unscheduled matches at local midnight. */
function formatWhen(iso: string | null, confirmedTime?: string) {
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
  if (time === "00:00")
    return confirmedTime ? `${day} · ${confirmedTime}` : `${day} · time TBD`
  return `${day} · ${time}`
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

export type FaceitInfo = Record<
  string,
  { elo: number | null; level: number | null }
>

function Avatar({ url }: { url: string | undefined }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- small external Steam avatars
    <img
      src={url}
      alt=""
      className="size-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="size-8 shrink-0 rounded-full bg-muted" />
  )
}

function LineupCard({
  name,
  logoPath,
  lineup,
  teamNames,
  avatarUrls,
  faceit,
}: {
  name: string
  logoPath: string | null
  lineup: TeamLineup | undefined
  teamNames: Record<string, string>
  avatarUrls: Record<string, string>
  faceit: FaceitInfo
}) {
  const linked = teamNames[name]
  return (
    <div className="flex h-full min-w-0 flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        {logoPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- small external team logos
          <img
            src={`${WIDGET_ORIGIN}${logoPath}`}
            alt=""
            className="size-6 shrink-0 rounded object-contain"
          />
        ) : null}
        <div className="min-w-0">
          {linked ? (
            <Link
              href={`/teams/team/${encodeURIComponent(linked)}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium">{name}</span>
          )}
          {lineup?.topMaps.length ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase">
                {lineup.mapsHidden ? "Map pool" : "Top maps"}
              </span>
              <ul className="flex gap-1" aria-label="Most played maps">
                {lineup.topMaps.map((m, i) => {
                  const src = getMapIconUrl(m.mapName)
                  const name = formatMapName(m.mapName)
                  const label = lineup.mapsHidden
                    ? `${name}: in the map pool (full pool shown, map preference hidden)`
                    : `${name}: #${i + 1} most played map for ${lineup.teamName}, in ${m.count} demo${m.count === 1 ? "" : "s"} (non-scrim; top 4 shown)`
                  return (
                    <li key={m.mapName} title={label}>
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small static map icons
                        <img
                          src={src}
                          alt={label}
                          className="size-5 object-contain"
                        />
                      ) : (
                        <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px]">
                          {name?.slice(0, 2)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      {lineup?.players.length ? (
        <ul className="grid gap-2">
          <li
            aria-hidden
            className="grid grid-cols-[2rem_minmax(0,1fr)_3rem_6rem] items-end gap-x-3 text-[11px] text-muted-foreground uppercase"
          >
            <span />
            <span>Player</span>
            <span className="text-right">Rating</span>
            <span className="border-l pl-3">FACEIT</span>
          </li>
          {lineup.players.map((p) => {
            const f = p.steamid64 ? faceit[p.steamid64] : undefined
            return (
              <li
                key={p.nickname}
                className="grid grid-cols-[2rem_minmax(0,1fr)_3rem_6rem] items-center gap-x-3 text-sm"
              >
                <Avatar
                  url={p.steamid64 ? avatarUrls[p.steamid64] : undefined}
                />
                <span className="truncate" title={p.inGameName ?? undefined}>
                  {p.nickname}
                </span>
                <span className="text-right font-mono tabular-nums">
                  <RatingValue rating={p.rating} teamName={lineup.teamName} />
                </span>
                <span
                  className="flex items-baseline gap-1.5 border-l pl-3 font-mono tabular-nums"
                  title="FACEIT Elo and skill level"
                >
                  {f?.elo != null ? (
                    <>
                      {f.level != null ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs from /public
                        <img
                          src={`/faceit-levels/${f.level}.svg`}
                          alt={`Faceit level ${f.level}`}
                          title={`Faceit level ${f.level}`}
                          className="size-5 self-center"
                        />
                      ) : null}
                      {f.elo}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No lineup data for this team yet.
        </p>
      )}
    </div>
  )
}

function PreviewSideView({
  side,
  lineups,
  teamNames,
  avatarUrls,
  faceit,
}: {
  side: PreviewSide
  lineups: Record<string, TeamLineup>
  teamNames: Record<string, string>
  avatarUrls: Record<string, string>
  faceit: FaceitInfo
}) {
  if (side.kind === "team")
    return (
      <LineupCard
        name={side.name}
        logoPath={side.logoPath}
        lineup={lineups[side.name]}
        teamNames={teamNames}
        avatarUrls={avatarUrls}
        faceit={faceit}
      />
    )
  if (side.kind === "candidates")
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Winner of {side.names.join(" vs ")}
        </p>
        {side.names.map((name, i) => (
          <LineupCard
            key={name}
            name={name}
            logoPath={side.logoPaths[i]}
            lineup={lineups[name]}
            teamNames={teamNames}
            avatarUrls={avatarUrls}
            faceit={faceit}
          />
        ))}
      </div>
    )
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      To be decided
    </div>
  )
}

/** Our team's match is listed first. */
const FEATURED_TEAM = /netlight/i
const isFeatured = ({ sides }: MatchPreview) =>
  sides.some((side) =>
    side.kind === "team"
      ? FEATURED_TEAM.test(side.name)
      : side.kind === "candidates" &&
        side.names.some((n) => FEATURED_TEAM.test(n))
  )

function MatchPreviewSection({
  previews,
  rounds,
  lineups,
  teamNames,
  avatarUrls,
  faceit,
}: {
  previews: MatchPreview[]
  rounds: string[]
  lineups: Record<string, TeamLineup>
  teamNames: Record<string, string>
  avatarUrls: Record<string, string>
  faceit: FaceitInfo
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
        Match preview
      </h2>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {[...previews]
          .sort((a, b) => Number(isFeatured(b)) - Number(isFeatured(a)))
          .map(({ match, sides }) => (
            <div
              key={match.id}
              className="@container flex min-w-0 flex-col gap-4 rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-4 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-lg font-bold tracking-tight">
                  {rounds[match.round]}{" "}
                  <span className="text-sm font-medium text-muted-foreground">
                    {match.label}
                  </span>
                </span>
                <span className="rounded-full bg-amber-500 px-3 py-1 font-mono text-xs font-semibold text-black">
                  {formatWhen(
                    match.scheduledAt,
                    confirmedTime(rounds[match.round])
                  )}
                </span>
              </div>
              <div className="grid flex-1 items-stretch gap-3 @2xl:grid-cols-[1fr_auto_1fr]">
                <PreviewSideView
                  side={sides[0]}
                  lineups={lineups}
                  teamNames={teamNames}
                  avatarUrls={avatarUrls}
                  faceit={faceit}
                />
                <span className="mx-auto flex size-12 items-center justify-center self-center rounded-full border-2 border-amber-500/50 bg-background text-sm font-black tracking-wider text-amber-600 italic shadow-md dark:text-amber-400">
                  VS
                </span>
                <PreviewSideView
                  side={sides[1]}
                  lineups={lineups}
                  teamNames={teamNames}
                  avatarUrls={avatarUrls}
                  faceit={faceit}
                />
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}

export function BracketView({
  season,
  sourceUrl,
  bracket,
  teamNames,
  previews,
  lineups,
  avatarUrls,
  faceit,
}: {
  season: string
  sourceUrl: string
  bracket: BracketData
  teamNames: Record<string, string>
  previews: MatchPreview[]
  lineups: Record<string, TeamLineup>
  avatarUrls: Record<string, string>
  faceit: FaceitInfo
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
      <header className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-muted/40 to-transparent p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-amber-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-2 -bottom-6 text-[9rem] leading-none opacity-15 select-none"
        >
          🏆
        </div>
        <div className="relative flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-[0.3em] text-amber-600 uppercase dark:text-amber-400">
            {season} · Counter-Strike 2
          </span>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
            Playoffs
          </h1>
          {champion ? (
            <p className="text-lg font-semibold">
              🏆 Champion:{" "}
              <span className="text-amber-600 dark:text-amber-400">
                {champion.name}
              </span>
            </p>
          ) : current !== null ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
              Now: {bracket.rounds[current]}
            </p>
          ) : null}
        </div>
      </header>

      {upcoming.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase">
            Up next
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-44 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatWhen(
                    m.scheduledAt,
                    confirmedTime(bracket.rounds[m.round])
                  )}
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

      {previews.length ? (
        <MatchPreviewSection
          previews={previews}
          rounds={bracket.rounds}
          lineups={lineups}
          teamNames={teamNames}
          avatarUrls={avatarUrls}
          faceit={faceit}
        />
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

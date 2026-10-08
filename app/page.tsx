import { Suspense } from "react"
import Link from "next/link"
import {
  getCurrentSeason,
  getCurrentTeamCatalog,
  getFaceitPlayerStats,
  getLeaderboard,
  type TeamMeta,
} from "@/lib/cached-data"
import {
  getLiveDivisionResults,
  getLiveDivisionStandings,
} from "@/lib/cached-toornament"
import type { ScheduledMatch } from "@/lib/toornament-schedule"
import { resolveOfficialTeam } from "@/lib/toornament-standings"
import { getPlayerSummaries } from "@/lib/steam-client"
import { RecentResultsTable } from "@/components/recent-results-table"
import { Skeleton } from "@/components/ui/skeleton"
import { LeaderboardTable } from "./leaderboard/leaderboard-table"
import { formatMatchDate, matchDateTime } from "@/lib/matches"

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
  { href: "/matches", label: "Matches" },
  { href: "/followed", label: "Follow a team" },
]

/** One representative team per division selects that division's stage. */
function divisionTeams(catalog: TeamMeta[]) {
  const byDivision = new Map<string, TeamMeta>()
  for (const team of catalog)
    if (!byDivision.has(team.division)) byDivision.set(team.division, team)
  return [...byDivision.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "en-GB", { numeric: true })
  )
}

// Official, live Toornament standings (same source as /follow/[team]).
async function Podiums() {
  const catalog = await getCurrentTeamCatalog()
  const byId = new Map(catalog.map((t) => [t.teamId, t]))
  const podiums = await Promise.all(
    divisionTeams(catalog).map(async ([division, team]) => {
      const live = await getLiveDivisionStandings(team, catalog)
      return {
        division,
        failed: live.rows.length === 0,
        top: live.rows.slice(0, 3).map((row) => ({
          ...row,
          team: row.teamId === null ? undefined : byId.get(row.teamId),
        })),
      }
    })
  )

  return podiums.map(({ division, top, failed }) => (
    <section
      key={division}
      className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
    >
      <h2 className="font-heading text-sm font-medium">{division}</h2>
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Live standings unavailable right now.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {top.map((t) => (
            <li
              key={t.rank}
              className="flex items-center gap-3 rounded-md bg-muted/50 p-2"
            >
              <span
                className={
                  "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium " +
                  (t.rank === 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground")
                }
              >
                {t.rank}
              </span>
              {t.team?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.team.logoUrl}
                  alt=""
                  className="size-7 shrink-0 rounded object-contain"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                {t.team ? (
                  <Link
                    href={`/follow/${encodeURIComponent(t.team.teamName)}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {t.teamName}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-medium">
                    {t.teamName}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {t.wins}W {t.losses}L
                </span>
              </div>
              <span className="shrink-0 font-mono text-sm font-medium">
                {t.points}
                <span className="text-xs text-muted-foreground"> pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  ))
}

async function TopPlayers() {
  const season = (await getCurrentSeason()) ?? undefined
  const players = await getLeaderboard({
    stat: "kills",
    direction: "desc",
    season,
    limit: 5,
  })
  const ids = players.map((row) => row.steamid64)
  const [faceitStats, steamSummaries] = await Promise.all([
    getFaceitPlayerStats(7, ids),
    getPlayerSummaries(ids),
  ])
  // Same row shaping as app/leaderboard/page.tsx.
  const rows = players.map((row) => {
    const fs = faceitStats.get(row.steamid64)
    return {
      ...row,
      faceitElo: fs?.elo ?? null,
      faceitNickname: fs?.faceitNickname ?? null,
      faceitRecent:
        !fs || fs.matchesRecent === 0
          ? "—"
          : `${fs.matchesRecent} games, ${fs.avgKd != null ? fs.avgKd.toFixed(2) : "—"} K/D, ${fs.avgAdr != null ? fs.avgAdr.toFixed(1) : "—"} ADR`,
      avatarUrl: steamSummaries.get(row.steamid64)?.avatarUrl ?? null,
    }
  })
  return <LeaderboardTable rows={rows} stat="kills" statLabel="Kills" compact />
}

// Latest completed official matches, scraped live from the Toornament
// schedule widget. Divisions can share a tournament, so dedupe by match id.
async function RecentMatches() {
  const catalog = await getCurrentTeamCatalog()
  const widgetMatches = new Map<string, ScheduledMatch>()
  for (const matches of await Promise.all(
    divisionTeams(catalog).map(([, team]) => getLiveDivisionResults(team))
  )) {
    for (const m of matches ?? []) widgetMatches.set(m.toornamentMatchId, m)
  }
  const recent = [...widgetMatches.values()]
    .map((m) => {
      const a = resolveOfficialTeam(m.teamAName, catalog)
      const b = resolveOfficialTeam(m.teamBName, catalog)
      return {
        matchId: m.toornamentMatchId,
        date: formatMatchDate(m.scheduledAt),
        dateSort: matchDateTime(m.scheduledAt) ?? 0,
        teamAName: a?.teamName ?? m.teamAName,
        teamAId: a?.teamId ?? null,
        teamBName: b?.teamName ?? m.teamBName,
        teamBId: b?.teamId ?? null,
        score: `${m.teamAScore}-${m.teamBScore}`,
        division: a?.division ?? b?.division ?? "",
      }
    })
    .sort((x, y) => y.dateSort - x.dateSort)
    .slice(0, 5)
  return <RecentResultsTable rows={recent} />
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

function PodiumSkeleton() {
  return Array.from({ length: 4 }, (_, i) => (
    <Skeleton key={i} className="h-48 rounded-lg" aria-busy="true" />
  ))
}

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-heading text-lg font-medium">
          Svenska Företagsligan
        </h1>
        <div className="flex flex-wrap gap-2 pt-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<PodiumSkeleton />}>
          <Podiums />
        </Suspense>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-sm font-medium">
              Divisionernas Största Djur
            </h2>
            <Link
              href="/leaderboard"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </div>
          <Suspense fallback={<TableSkeleton />}>
            <TopPlayers />
          </Suspense>
        </section>
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-sm font-medium">Recent matches</h2>
            <Link
              href="/matches"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </div>
          <Suspense fallback={<TableSkeleton />}>
            <RecentMatches />
          </Suspense>
        </section>
      </div>
    </div>
  )
}

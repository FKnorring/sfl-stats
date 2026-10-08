import Link from "next/link"
import { connection } from "next/server"
import {
  getCurrentSeason,
  getCurrentTeamCatalog,
  getLeaderboard,
} from "@/lib/db"
import {
  getLiveDivisionResults,
  getLiveDivisionStandings,
} from "@/lib/toornament-live"
import type { ScheduledMatch } from "@/lib/toornament-schedule"
import { resolveOfficialTeam } from "@/lib/toornament-standings"
import { getFaceitPlayerStats } from "@/lib/faceit"
import { getPlayerSummaries } from "@/lib/steam-client"
import { RecentResultsTable } from "@/components/recent-results-table"
import { LeaderboardTable } from "./leaderboard/leaderboard-table"
import { formatMatchDate, matchDateTime } from "@/lib/matches"

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/teams", label: "Teams" },
  { href: "/matches", label: "Matches" },
  { href: "/followed", label: "Follow a team" },
]

export default async function Page() {
  // Request-time DB reads, same as the other data pages.
  await connection()
  const season = (await getCurrentSeason()) ?? undefined
  const [catalog, players, faceitStats] = await Promise.all([
    getCurrentTeamCatalog(),
    getLeaderboard({ stat: "kills", direction: "desc", season }),
    getFaceitPlayerStats(),
  ])

  // Official, live Toornament standings (same source as /follow/[team]); one
  // representative team per division selects the division's stage.
  const divisions = [...new Set(catalog.map((t) => t.division))].sort((a, b) =>
    a.localeCompare(b, "en-GB", { numeric: true })
  )
  const podiums = await Promise.all(
    divisions.map(async (division) => {
      const team = catalog.find((t) => t.division === division)!
      const live = await getLiveDivisionStandings(team, catalog)
      return {
        division,
        failed: live.rows.length === 0,
        top: live.rows.slice(0, 3).map((row) => ({
          ...row,
          logoUrl: catalog.find((t) => t.teamId === row.teamId)?.logoUrl,
        })),
      }
    })
  )

  const topLeaderboard = players.slice(0, 5)
  const steamSummaries = await getPlayerSummaries(
    topLeaderboard.map((row) => row.steamid64)
  )
  // Same row shaping as app/leaderboard/page.tsx.
  const topPlayers = topLeaderboard.map((row) => {
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

  // Latest completed official matches, scraped live from the Toornament
  // schedule widget. Divisions can share a tournament, so dedupe by match id.
  const widgetMatches = new Map<string, ScheduledMatch>()
  for (const matches of await Promise.all(
    divisions.map((division) =>
      getLiveDivisionResults(catalog.find((t) => t.division === division)!)
    )
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
        {podiums.map(({ division, top, failed }) => (
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
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.logoUrl}
                        alt=""
                        className="size-7 shrink-0 rounded object-contain"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {t.teamId !== null ? (
                        <Link
                          href={`/follow/${encodeURIComponent(
                            catalog.find((c) => c.teamId === t.teamId)!.teamName
                          )}`}
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
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        pts
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
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
          <LeaderboardTable
            rows={topPlayers}
            stat="kills"
            statLabel="Kills"
            compact
          />
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
          <RecentResultsTable rows={recent} />
        </section>
      </div>
    </div>
  )
}

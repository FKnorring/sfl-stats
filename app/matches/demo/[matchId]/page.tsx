import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getDemoMatchById,
  getDemoMatchPlayerStats,
  getMatchKills,
  getToornamentScoreForDemo,
} from "@/lib/db"
import { getPlayerSummaries } from "@/lib/steam-client"
import { formatMapName, getMapImageUrl, getMapRadar } from "@/lib/map-images"
import { Badge } from "@/components/ui/badge"
import { DemoMatchView } from "./demo-match-view"

// Same reasoning as app/teams/[name]/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

export default async function DemoMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId: matchIdParam } = await params
  const matchId = Number(matchIdParam)
  if (!Number.isInteger(matchId)) notFound()

  const match = await getDemoMatchById(matchId)
  if (!match) notFound()

  const players = await getDemoMatchPlayerStats(matchId)
  const kills = await getMatchKills(matchId)
  const steamSummaries = await getPlayerSummaries(
    players.map((p) => p.steamid64)
  )

  // Pre-join Steam avatars into a plain, serializable field — the lookup
  // Map itself can't cross the server/client boundary into DemoMatchTable.
  const playersWithAvatars = players.map((p) => ({
    ...p,
    avatarUrl: steamSummaries.get(p.steamid64)?.avatarUrl ?? null,
  }))

  // `side` is just the in-game CT/T slot (CS2's team_num) — only useful
  // for splitting the roster into two groups, never as a display name.
  const sides = Array.from(
    new Set(players.map((p) => p.side).filter((s): s is string => !!s))
  )
  const [sideA, sideB] = sides
  const sideAPlayers = sideA
    ? playersWithAvatars.filter((p) => p.side === sideA)
    : playersWithAvatars
  const sideBPlayers = sideB
    ? playersWithAvatars.filter((p) => p.side === sideB)
    : []

  // Prefer the resolved roster team on `matches` (set when ingestion could
  // pin exactly two distinct roster teams); otherwise fall back to
  // whichever roster team is most common among this side's players. Also
  // resolves that team's logo, since `matches.team_a/b_id` not being
  // resolved means `getDemoMatchById`'s team-logo join comes back null too.
  function majorityRosterTeam(
    rows: typeof players
  ): { name: string; logoUrl: string | null } | null {
    const counts = new Map<string, { count: number; logoUrl: string | null }>()
    for (const row of rows) {
      if (!row.rosterTeamName) continue
      const entry = counts.get(row.rosterTeamName)
      if (entry) {
        entry.count++
      } else {
        counts.set(row.rosterTeamName, {
          count: 1,
          logoUrl: row.rosterTeamLogoUrl,
        })
      }
    }
    let best: string | null = null
    let bestEntry: { count: number; logoUrl: string | null } | null = null
    for (const [name, entry] of counts) {
      if (!bestEntry || entry.count > bestEntry.count) {
        best = name
        bestEntry = entry
      }
    }
    return best ? { name: best, logoUrl: bestEntry!.logoUrl } : null
  }

  const majorityTeamA = majorityRosterTeam(sideAPlayers)
  const majorityTeamB = majorityRosterTeam(sideBPlayers)
  const teamAName = match.teamAName ?? majorityTeamA?.name ?? "Team A"
  const teamBName = match.teamBName ?? majorityTeamB?.name ?? "Team B"
  const teamALogoUrl = match.teamALogoUrl ?? majorityTeamA?.logoUrl ?? null
  const teamBLogoUrl = match.teamBLogoUrl ?? majorityTeamB?.logoUrl ?? null
  // matches.team_a/b_score is often unset; fall back to the completed
  // Toornament match for these two teams around the demo date.
  const fallbackScore =
    match.teamAScore == null || match.teamBScore == null
      ? await getToornamentScoreForDemo(match.demoDate, teamAName, teamBName)
      : null
  const teamAScore = match.teamAScore ?? fallbackScore?.teamAScore ?? null
  const teamBScore = match.teamBScore ?? fallbackScore?.teamBScore ?? null
  const mapImageUrl = getMapImageUrl(match.mapName)
  const radar = getMapRadar(match.mapName)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/leaderboard"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to leaderboard
      </Link>

      <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-border py-20 text-center">
        {mapImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- stylized backdrop, decorative */}
            <img
              src={mapImageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/50 to-background/10" />
          </>
        ) : null}
        <div className="relative flex flex-col items-center gap-2">
          {/* Single grid (not two stacked ones) so the logo and name rows
              share the same column widths and stay aligned on the same
              center axis as the vs/score, no matter how wide "vs" vs the
              score text is. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-8 gap-y-2">
            {teamALogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={teamALogoUrl}
                alt=""
                // bg-card (not bg-muted, which is shared with the no-logo
                // placeholder) so a logo with a transparent background
                // still reads against light and dark themes alike.
                className="size-16 justify-self-end rounded-md border border-border bg-card object-contain p-1.5 drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-end rounded-md border border-border bg-muted" />
            )}
            <div />
            {teamBLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same tradeoff as the team logos on /teams: small, variable-source external images
              <img
                src={teamBLogoUrl}
                alt=""
                className="size-16 justify-self-start rounded-md border border-border bg-card object-contain p-1.5 drop-shadow-sm"
              />
            ) : (
              <div className="size-16 justify-self-start rounded-md border border-border bg-muted" />
            )}
            <Link
              href={`/teams/${encodeURIComponent(teamAName)}`}
              className="justify-self-end text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamAName}
            </Link>
            {teamAScore != null && teamBScore != null ? (
              <span className="justify-self-center text-xl font-semibold tabular-nums">
                {teamAScore}–{teamBScore}
              </span>
            ) : (
              <span className="justify-self-center text-sm text-muted-foreground">
                vs
              </span>
            )}
            <Link
              href={`/teams/${encodeURIComponent(teamBName)}`}
              className="justify-self-start text-xl font-semibold underline-offset-4 drop-shadow-sm hover:underline"
            >
              {teamBName}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold drop-shadow-sm">
            {formatMapName(match.mapName) ?? "Unknown map"}
          </h1>
          {match.teamResolutionConflict ? (
            <Badge
              variant="outline"
              className="text-amber-600"
              title={match.teamResolutionConflict}
            >
              team identity needs review
            </Badge>
          ) : null}
        </div>
      </div>

      <DemoMatchView
        teamA={{ name: teamAName, score: teamAScore, players: sideAPlayers }}
        teamB={{ name: teamBName, score: teamBScore, players: sideBPlayers }}
        kills={kills}
        mapImageUrl={mapImageUrl}
        radar={radar}
      />
    </div>
  )
}

import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getCurrentTeamCatalog,
  getTeamRoster,
  getTeamDemoMatches,
  type TeamMeta,
} from "@/lib/cached-data"
import { getFaceitPlayerStats } from "@/lib/cached-data"
import { teamMvp } from "@/lib/follow-stats"
import {
  getLiveDivisionStandings,
  getLiveTeamPendingMatches,
} from "@/lib/cached-toornament"
import { resolveOfficialTeam } from "@/lib/toornament-standings"
import { formatMatchDate, matchDateTime } from "@/lib/matches"
import {
  FollowTeamButton,
  FavoriteTeamButton,
} from "@/components/follow-team-button"
import { FollowIndicator } from "@/components/follow-indicator"
import { FollowedTeamPicker } from "@/components/followed-team-picker"
import { OfficialDivisionTable } from "@/components/official-division-table"
import { TeamDemoMatches } from "@/components/team-demo-matches"
import { TeamRosterTable } from "@/components/team-roster-table"

function LoadingSection() {
  return (
    <p role="status" className="min-h-24 text-sm text-muted-foreground">
      Loading live Toornament data...
    </p>
  )
}

async function Upcoming({
  team,
  teams,
}: {
  team: TeamMeta
  teams: TeamMeta[]
}) {
  const matches = await getLiveTeamPendingMatches(team)
  if (matches === null)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Upcoming matches are unavailable. Couldn&apos;t reach the Toornament
        schedule.
      </p>
    )
  const upcoming = matches
    .map((match) => ({
      ...match,
      teamA: resolveOfficialTeam(match.teamAName, teams),
      teamB: resolveOfficialTeam(match.teamBName, teams),
    }))
    .filter(
      (match) =>
        match.teamA?.teamId === team.teamId ||
        match.teamB?.teamId === team.teamId
    )
    .sort(
      (a, b) =>
        (matchDateTime(a.scheduledAt) ?? Infinity) -
          (matchDateTime(b.scheduledAt) ?? Infinity) ||
        a.toornamentMatchId.localeCompare(b.toornamentMatchId)
    )
  if (!upcoming.length)
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming matches identified for this team.
      </p>
    )
  return (
    <div
      role="region"
      aria-label="Upcoming matches, scroll for more"
      tabIndex={0}
      className="flex gap-3 overflow-x-auto rounded-lg pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {upcoming.map((match) => (
        <div
          key={match.toornamentMatchId}
          className="flex min-w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-popover p-4"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {formatMatchDate(match.scheduledAt, true)}
          </span>
          <div className="flex items-center gap-2 text-sm font-medium">
            {match.teamAName}
            <FollowIndicator teamId={match.teamA?.teamId} />
          </div>
          <span className="text-xs text-muted-foreground">vs</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            {match.teamBName}
            <FollowIndicator teamId={match.teamB?.teamId} />
          </div>
        </div>
      ))}
    </div>
  )
}

async function Placement({
  team,
  teams,
}: {
  team: TeamMeta
  teams: TeamMeta[]
}) {
  const result = await getLiveDivisionStandings(team, teams)
  return (
    <>
      {result.error ? (
        <p role="status" className="text-sm text-muted-foreground">
          {result.error}
        </p>
      ) : null}
      {result.rows.length ? (
        <OfficialDivisionTable rows={result.rows} teamId={team.teamId} />
      ) : null}
      {result.sourceUrl ? (
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Official Toornament ranking
        </a>
      ) : null}
    </>
  )
}

export default async function FollowPage({
  params,
}: {
  params: Promise<{ team: string }>
}) {
  const { team: segment } = await params
  let name: string
  try {
    name = decodeURIComponent(segment)
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    notFound()
  }
  const teams = await getCurrentTeamCatalog()
  const candidates = teams.filter((team) => team.teamName === name)
  if (candidates.length === 0) notFound()
  if (candidates.length > 1) {
    return (
      <div role="alert" className="p-6 text-sm">
        This team name belongs to more than one division. Its dashboard cannot
        be identified uniquely.
      </div>
    )
  }
  const team = candidates[0]
  const [roster, demos, faceitStats] = await Promise.all([
    getTeamRoster(team.teamId, true),
    getTeamDemoMatches(team.teamId, true),
    getFaceitPlayerStats(),
  ])
  const mvp = teamMvp(roster)
  return (
    <div className="flex min-h-svh min-w-0 flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center gap-4">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small external team logo, consistent with team detail
          <img
            src={team.logoUrl}
            alt=""
            className="size-14 rounded-lg border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="font-heading text-lg font-medium">{team.teamName}</h1>
          <p className="text-sm text-muted-foreground">
            {team.division} / {team.season}
          </p>
        </div>
        <FollowIndicator teamId={team.teamId} />
        <FollowTeamButton teamName={team.teamName} />
        <FavoriteTeamButton teamName={team.teamName} />
        <Link
          href={`/teams/${encodeURIComponent(team.teamName)}`}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          Team details
        </Link>
      </header>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-labelledby="upcoming-heading"
      >
        <h2 id="upcoming-heading" className="font-heading text-sm font-medium">
          Upcoming matches
        </h2>
        <p className="text-xs text-muted-foreground">
          Toornament schedule, refreshed about every six hours. Times are
          Europe/Stockholm.
        </p>
        <Suspense fallback={<LoadingSection />}>
          <Upcoming team={team} teams={teams} />
        </Suspense>
      </section>
      <TeamDemoMatches
        teamId={team.teamId}
        matches={demos}
        title="Match history"
      />
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-labelledby="placement-heading"
      >
        <h2 id="placement-heading" className="font-heading text-sm font-medium">
          {team.division} placement
        </h2>
        <p className="text-xs text-muted-foreground">
          Official rank, not calculated from ingested demos. Refreshed about
          every six hours; older data may appear during refresh or outages.
        </p>
        <Suspense fallback={<LoadingSection />}>
          <Placement team={team} teams={teams} />
        </Suspense>
      </section>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-labelledby="players-heading"
      >
        <h2 id="players-heading" className="font-heading text-sm font-medium">
          Player stats
        </h2>
        {mvp ? (
          <div className="rounded-lg border border-border bg-muted p-4 text-sm">
            <span className="font-heading text-xs text-muted-foreground">
              DEMO-STAT MVP
            </span>
            <p className="mt-1 font-medium">
              {mvp.inGameName ?? mvp.nickname} / {mvp.adr?.toFixed(1)} ADR /{" "}
              {mvp.matchesPlayed} demos
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No eligible demo data for an MVP yet.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Stats use demos attributed to this team-season. Unanchored demos rely
          on roster evidence; precise historical season attribution may be
          unavailable. MVP is ranked by ADR, then K/D, then demos played.
        </p>
        <TeamRosterTable
          teamId={team.teamId}
          teamName={team.teamName}
          roster={roster}
          faceitStats={faceitStats}
          includeAccounts={false}
        />
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="other-heading">
        <h2 id="other-heading" className="font-heading text-sm font-medium">
          Other followed teams
        </h2>
        <FollowedTeamPicker except={team.teamName} />
      </section>
    </div>
  )
}

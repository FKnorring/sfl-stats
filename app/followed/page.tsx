import Link from "next/link"
import { getCurrentSeason, getTeamByName, getTeamDemoMatches } from "@/lib/db"
import { getFollowedTeamNames } from "@/lib/followed-teams"
import { getLivePendingMatches, involvesTeam } from "@/lib/toornament-live"
import { FollowTeamButton } from "@/components/follow-team-button"
import { TeamDemoMatches } from "@/components/team-demo-matches"
import { Badge } from "@/components/ui/badge"
import type { ScheduledMatch } from "@/lib/toornament-schedule"

// Followed teams live in a cookie and the schedule is fetched live.
export const dynamic = "force-dynamic"

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "TBD"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function byTime(a: ScheduledMatch, b: ScheduledMatch) {
  return (a.scheduledAt ?? "9999").localeCompare(b.scheduledAt ?? "9999")
}

export default async function FollowedPage() {
  const names = await getFollowedTeamNames()

  if (names.length === 0) {
    return (
      <div className="flex min-h-svh flex-col gap-2 p-6 text-sm">
        <h1 className="text-lg font-medium">Followed teams</h1>
        <p className="text-muted-foreground">
          You&apos;re not following any teams yet. Open a{" "}
          <Link href="/teams" className="underline underline-offset-4">
            team page
          </Link>{" "}
          and press Follow.
        </p>
      </div>
    )
  }

  const season = (await getCurrentSeason()) ?? undefined
  const [live, teams] = await Promise.all([
    getLivePendingMatches(),
    Promise.all(
      names.map(async (name) => {
        const meta = await getTeamByName(name, season)
        return {
          name,
          meta,
          demos: meta ? await getTeamDemoMatches(meta.teamId) : [],
        }
      })
    ),
  ])

  return (
    <div className="flex min-h-svh flex-col gap-8 p-6">
      <h1 className="text-lg font-medium">Followed teams</h1>

      {teams.map(({ name, meta, demos }) => {
        const upcoming = (live ?? [])
          .filter((m) => involvesTeam(m, name))
          .sort(byTime)
        return (
          <section key={name} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-medium">
                {meta ? (
                  <Link
                    href={`/teams/${encodeURIComponent(name)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </h2>
              <FollowTeamButton teamName={name} followed iconOnly />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Upcoming matches
              </h3>
              {live === null ? (
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t reach Toornament right now.
                </p>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming matches scheduled.
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {upcoming.map((m) => (
                    <div
                      key={m.toornamentMatchId}
                      className="flex min-w-56 shrink-0 flex-col gap-2 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-xs"
                    >
                      <Badge variant="outline" className="w-fit">
                        {formatScheduledAt(m.scheduledAt)}
                      </Badge>
                      <span className="text-sm font-medium">{m.teamAName}</span>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <span className="text-sm font-medium">{m.teamBName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <TeamDemoMatches matches={demos} title="Match history" />
          </section>
        )
      })}
    </div>
  )
}

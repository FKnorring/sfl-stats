"use client"

import Link from "next/link"
import { useFollows } from "@/components/follow-provider"
import {
  FollowTeamButton,
  FavoriteTeamButton,
} from "@/components/follow-team-button"
import { FollowIndicator } from "@/components/follow-indicator"
import { currentTeam, followHref, followClass } from "@/lib/followed-teams"

export function FollowedTeamPicker({ except }: { except?: string }) {
  const { state, ready, teams } = useFollows()
  if (!ready)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading followed teams...
      </p>
    )
  const follows = state.follows.filter((f) => f.teamName !== except)
  if (!follows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {except
          ? "No other followed teams. "
          : "You aren't following any teams yet. "}
        <Link href="/teams" className="underline underline-offset-4">
          Browse teams
        </Link>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {follows.map((follow) => {
        const team = currentTeam(follow.teamName, teams)
        return (
          <div
            key={follow.teamName}
            className={`flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 ${followClass(follow)}`}
          >
            {team ? (
              <Link
                href={followHref(team.teamName)}
                className="flex min-h-11 min-w-0 flex-1 basis-full items-center text-sm font-medium underline-offset-4 hover:underline sm:basis-auto"
              >
                {team.teamName}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
                {follow.teamName}{" "}
                <span className="text-muted-foreground">(unavailable)</span>
              </span>
            )}
            <FollowIndicator teamId={team?.teamId} />
            <FavoriteTeamButton teamName={follow.teamName} />
            <FollowTeamButton teamName={follow.teamName} />
          </div>
        )
      })}
    </div>
  )
}

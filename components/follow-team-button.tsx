"use client"

import { HeartIcon, StarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFollows } from "@/components/follow-provider"
import { currentTeam } from "@/lib/followed-teams"

export function FollowTeamButton({
  teamName,
  iconOnly = false,
}: {
  teamName: string
  iconOnly?: boolean
}) {
  const { state, ready, teams, toggle } = useFollows()
  const followed = state.follows.some((f) => f.teamName === teamName)
  const team = currentTeam(teamName, teams)
  const label = followed ? "Unfollow" : "Follow"

  return (
    <Button
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      className="min-h-11 min-w-11"
      disabled={!ready || (!followed && !team)}
      aria-label={`${label} ${teamName}`}
      aria-pressed={followed}
      onClick={(event) => {
        event.stopPropagation()
        toggle(team ?? { teamName, teamId: null })
      }}
    >
      <HeartIcon className={followed ? "fill-current" : ""} />
      {iconOnly ? null : label}
    </Button>
  )
}

export function FavoriteTeamButton({ teamName }: { teamName: string }) {
  const { state, ready, favorite } = useFollows()
  const active = state.favorite === teamName
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 min-w-11"
      disabled={!ready || !state.follows.some((f) => f.teamName === teamName)}
      aria-label={`${active ? "Favorite" : "Make favorite"} ${teamName}`}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation()
        favorite(teamName)
      }}
    >
      <StarIcon className={active ? "fill-current" : ""} />
      {active ? "Favorite" : "Make favorite"}
    </Button>
  )
}

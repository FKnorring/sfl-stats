"use client"

import { HeartIcon, StarIcon } from "lucide-react"
import { useFollow, useFollows } from "@/components/follow-provider"
import { followClass } from "@/lib/followed-teams"

export function useFollowRowClass() {
  const { state } = useFollows()
  return (teamId: number | null | undefined) =>
    followClass(
      teamId == null
        ? undefined
        : state.follows.find((f) => f.teamId === teamId)
    )
}

export function FollowIndicator({
  teamId,
}: {
  teamId: number | null | undefined
}) {
  const follow = useFollow(teamId)
  const { state } = useFollows()
  if (!follow) return null
  const favorite = follow.teamName === state.favorite
  const Icon = favorite ? StarIcon : HeartIcon
  const label = `${favorite ? "Favorite" : "Followed"}: ${follow.teamName}, marker ${follow.colorSlot + 1}`
  return (
    <span
      className={`follow-marker follow-color-${follow.colorSlot % 6} inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs`}
      title={label}
      aria-label={label}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span aria-hidden="true">F{follow.colorSlot + 1}</span>
    </span>
  )
}

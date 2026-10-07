"use client"

import * as React from "react"
import { StarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toggleFollowTeam } from "@/app/followed/actions"

export function FollowTeamButton({
  teamName,
  followed,
  iconOnly = false,
}: {
  teamName: string
  followed: boolean
  iconOnly?: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  const label = followed ? "Unfollow" : "Follow"

  return (
    <Button
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      disabled={pending}
      aria-label={`${label} ${teamName}`}
      aria-pressed={followed}
      onClick={() => startTransition(() => toggleFollowTeam(teamName))}
    >
      <StarIcon className={followed ? "fill-amber-400 text-amber-400" : ""} />
      {iconOnly ? null : label}
    </Button>
  )
}

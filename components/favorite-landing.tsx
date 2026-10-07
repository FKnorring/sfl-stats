"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useFollows } from "@/components/follow-provider"
import { currentTeam, followHref } from "@/lib/followed-teams"

export function FavoriteLanding({ children }: { children: React.ReactNode }) {
  const { state, ready, teams } = useFollows()
  const router = useRouter()
  const favorite = state.favorite ? currentTeam(state.favorite, teams) : null
  const href = favorite ? followHref(favorite.teamName) : null
  React.useEffect(() => {
    if (ready && href) router.replace(href)
  }, [ready, href, router])
  if (!ready || href) {
    return (
      <div role="status" className="p-6 text-sm text-muted-foreground">
        Loading your home page...
      </div>
    )
  }
  return children
}

"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { FOLLOWED_COOKIE, getFollowedTeamNames } from "@/lib/followed-teams"

/** Follows the team if not followed, otherwise unfollows it. */
export async function toggleFollowTeam(teamName: string) {
  const current = await getFollowedTeamNames()
  const next = current.includes(teamName)
    ? current.filter((n) => n !== teamName)
    : [...current, teamName]
  ;(await cookies()).set(FOLLOWED_COOKIE, JSON.stringify(next), {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  })
  revalidatePath("/followed")
  revalidatePath(`/teams/${encodeURIComponent(teamName)}`)
}

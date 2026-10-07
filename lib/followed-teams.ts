import { cookies } from "next/headers"

export const FOLLOWED_COOKIE = "followed-teams"

/** Followed team names, persisted in a cookie so they survive between visits. */
export async function getFollowedTeamNames(): Promise<string[]> {
  const raw = (await cookies()).get(FOLLOWED_COOKIE)?.value
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((n): n is string => typeof n === "string")
      : []
  } catch {
    return []
  }
}

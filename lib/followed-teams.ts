import { z } from "zod"

export const FOLLOWED_COOKIE = "followed-teams"
export const FOLLOWED_STORAGE = "sfl-followed-teams"

export type FollowTeam = { teamId: number; teamName: string }
export type Follow = {
  teamId: number | null
  teamName: string
  colorSlot: number
}

const preferencesSchema = z.object({
  version: z.literal(1),
  follows: z.array(
    z.object({
      teamId: z.number().int().positive().nullable(),
      teamName: z.string().trim().min(1),
      colorSlot: z.number().int().nonnegative().safe(),
    })
  ),
  favorite: z.string().nullable(),
  nextColor: z.number().int().nonnegative().safe(),
})

export type FollowPreferences = z.infer<typeof preferencesSchema>

export function emptyPreferences(): FollowPreferences {
  return { version: 1, follows: [], favorite: null, nextColor: 0 }
}

export function parsePreferences(raw: string): FollowPreferences {
  const state = preferencesSchema.parse(JSON.parse(raw))
  if (
    new Set(state.follows.map((f) => f.teamName)).size !==
      state.follows.length ||
    new Set(state.follows.map((f) => f.colorSlot)).size !==
      state.follows.length ||
    state.follows.some((f) => f.colorSlot >= state.nextColor) ||
    (state.follows.length === 0
      ? state.favorite !== null
      : !state.follows.some((f) => f.teamName === state.favorite))
  ) {
    throw new Error("Invalid follow preferences")
  }
  return state
}

export function currentTeam(
  name: string,
  teams: FollowTeam[]
): FollowTeam | null {
  const matches = teams.filter((team) => team.teamName === name)
  return matches.length === 1 ? matches[0] : null
}

export function refreshTeamIds(
  state: FollowPreferences,
  teams: FollowTeam[]
): FollowPreferences {
  return {
    ...state,
    follows: state.follows.map((follow) => ({
      ...follow,
      teamId: currentTeam(follow.teamName, teams)?.teamId ?? null,
    })),
  }
}

export function migrateCookie(
  raw: string,
  teams: FollowTeam[]
): FollowPreferences {
  const names = z.array(z.string().trim().min(1)).parse(JSON.parse(raw))
  const unique = [...new Set(names)]
  return {
    version: 1,
    follows: unique.map((teamName, colorSlot) => ({
      teamName,
      teamId: currentTeam(teamName, teams)?.teamId ?? null,
      colorSlot,
    })),
    favorite: unique[0] ?? null,
    nextColor: unique.length,
  }
}

export function toggleFollow(
  state: FollowPreferences,
  team: Pick<Follow, "teamName" | "teamId">
): FollowPreferences {
  const exists = state.follows.some((f) => f.teamName === team.teamName)
  const follows = exists
    ? state.follows.filter((f) => f.teamName !== team.teamName)
    : [
        ...state.follows,
        {
          teamId: team.teamId,
          teamName: team.teamName,
          colorSlot: state.nextColor,
        },
      ]
  return {
    ...state,
    follows,
    favorite:
      !state.favorite || (exists && state.favorite === team.teamName)
        ? (follows[0]?.teamName ?? null)
        : state.favorite,
    nextColor: exists ? state.nextColor : state.nextColor + 1,
  }
}

export function setFavorite(
  state: FollowPreferences,
  teamName: string
): FollowPreferences {
  if (!state.follows.some((f) => f.teamName === teamName)) {
    throw new Error("Only followed teams can be favorited")
  }
  return { ...state, favorite: teamName }
}

export function followHref(teamName: string): string {
  return `/follow/${encodeURIComponent(teamName)}`
}

export function followClass(follow: Follow | undefined): string | undefined {
  return follow ? `follow-row follow-color-${follow.colorSlot % 6}` : undefined
}

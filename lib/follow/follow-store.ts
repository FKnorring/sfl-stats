import {
  emptyPreferences,
  migrateCookie,
  parsePreferences,
  refreshTeamIds,
  setFavorite,
  toggleFollow,
  type Follow,
  type FollowPreferences,
  type FollowTeam,
} from "@/lib/followed-teams"

type StorageAccess = {
  read: () => string | null
  write: (value: string) => void
  legacy: () => string | null
  clearLegacy: () => void
}

const storageWarning =
  "Browser storage is unavailable. Follow changes last only for this visit."
const invalidWarning =
  "Saved follows could not be read. Reset them to save new preferences."

export function createFollowStore() {
  let snapshot = {
    state: emptyPreferences(),
    ready: false,
    warning: null as string | null,
    blocked: false,
  }
  const serverSnapshot = snapshot
  const listeners = new Set<() => void>()
  let storage: StorageAccess | null = null
  let teams: FollowTeam[] = []

  function publish(next: typeof snapshot) {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  function persist(state: FollowPreferences, reset = false) {
    if (snapshot.blocked && !reset) {
      publish({ ...snapshot, state })
      return
    }
    try {
      if (!storage) throw new Error("Browser storage has not loaded")
      storage.write(JSON.stringify(state))
      storage.clearLegacy()
      publish({ state, ready: true, warning: null, blocked: false })
    } catch (error) {
      console.error("[follow] Could not persist preferences:", error)
      publish({ ...snapshot, state, ready: true, warning: storageWarning })
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load(catalog: FollowTeam[], access: StorageAccess) {
      teams = catalog
      storage = access
      if (snapshot.ready) {
        const next = refreshTeamIds(snapshot.state, teams)
        if (JSON.stringify(next) !== JSON.stringify(snapshot.state))
          persist(next)
        return
      }
      let raw: string | null = null
      let inaccessible = false
      try {
        raw = storage.read()
      } catch (error) {
        console.error("[follow] Could not read browser storage:", error)
        inaccessible = true
      }
      let state: FollowPreferences
      try {
        const legacy = raw === null ? storage.legacy() : null
        state = refreshTeamIds(
          raw !== null
            ? parsePreferences(raw)
            : legacy !== null
              ? migrateCookie(legacy, teams)
              : emptyPreferences(),
          teams
        )
      } catch (error) {
        console.error("[follow] Invalid saved preferences:", error)
        publish({
          ...snapshot,
          ready: true,
          warning: invalidWarning,
          blocked: true,
        })
        return
      }
      if (inaccessible) {
        publish({ ...snapshot, state, ready: true, warning: storageWarning })
      } else {
        persist(state)
      }
    },
    receive(raw: string | null) {
      try {
        const state = refreshTeamIds(
          raw === null ? emptyPreferences() : parsePreferences(raw),
          teams
        )
        publish({ state, ready: true, warning: null, blocked: false })
      } catch (error) {
        console.error("[follow] Invalid cross-tab preferences:", error)
        publish({ ...snapshot, warning: invalidWarning, blocked: true })
      }
    },
    toggle: (team: Pick<Follow, "teamName" | "teamId">) =>
      persist(toggleFollow(snapshot.state, team)),
    favorite: (name: string) => persist(setFavorite(snapshot.state, name)),
    reset: () => persist(emptyPreferences(), true),
  }
}

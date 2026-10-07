"use client"

import * as React from "react"
import { createFollowStore } from "@/lib/follow-store"
import {
  currentTeam,
  FOLLOWED_COOKIE,
  FOLLOWED_STORAGE,
  type FollowTeam,
} from "@/lib/followed-teams"
import { Button } from "@/components/ui/button"

type FollowContextValue = ReturnType<
  ReturnType<typeof createFollowStore>["getSnapshot"]
> & {
  teams: FollowTeam[]
  toggle: ReturnType<typeof createFollowStore>["toggle"]
  favorite: ReturnType<typeof createFollowStore>["favorite"]
}

const FollowContext = React.createContext<FollowContextValue | null>(null)

export function FollowProvider({
  teams,
  children,
}: {
  teams: FollowTeam[]
  children?: React.ReactNode
}) {
  const [store] = React.useState(createFollowStore)
  const snapshot = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  )
  React.useEffect(() => {
    store.load(teams, {
      read: () => localStorage.getItem(FOLLOWED_STORAGE),
      write: (value) => localStorage.setItem(FOLLOWED_STORAGE, value),
      legacy: () => {
        const cookie = document.cookie
          .split("; ")
          .find((entry) => entry.startsWith(`${FOLLOWED_COOKIE}=`))
        return cookie
          ? decodeURIComponent(cookie.slice(FOLLOWED_COOKIE.length + 1))
          : null
      },
      clearLegacy: () => {
        document.cookie = `${FOLLOWED_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
      },
    })
    function onStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) return
      if (event.key === FOLLOWED_STORAGE || event.key === null)
        store.receive(event.newValue)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [teams, store])
  const unavailable = snapshot.state.follows.filter(
    (f) => !currentTeam(f.teamName, teams)
  )
  return (
    <FollowContext.Provider
      value={{
        ...snapshot,
        teams,
        toggle: store.toggle,
        favorite: store.favorite,
      }}
    >
      {snapshot.warning || unavailable.length ? (
        <div
          role="status"
          className="border-b border-border bg-muted px-4 py-2 text-sm"
        >
          {snapshot.warning}
          {unavailable.length ? (
            <p>
              Unavailable in the current season:{" "}
              {unavailable.map((f) => f.teamName).join(", ")}. You can remove
              them on the Followed page.
            </p>
          ) : null}
          {snapshot.blocked ? (
            <Button variant="outline" size="sm" onClick={store.reset}>
              Reset saved follows
            </Button>
          ) : null}
        </div>
      ) : null}
      {children}
    </FollowContext.Provider>
  )
}

export function useFollows() {
  const context = React.useContext(FollowContext)
  if (!context) throw new Error("Follow controls require FollowProvider")
  return context
}

export function useFollow(teamId: number | null | undefined) {
  const { state } = useFollows()
  return teamId == null
    ? undefined
    : state.follows.find((f) => f.teamId === teamId)
}

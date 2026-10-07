"use client"

import * as React from "react"
import { Checkbox } from "@base-ui/react/checkbox"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { CheckIcon, ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

type Picked = { teamId: number; teamName: string }

type CompareContextValue = {
  picked: Picked[]
  toggle: (team: Picked) => void
}

const CompareContext = React.createContext<CompareContextValue | null>(null)

/**
 * Shares the current team-compare selection between one checkbox per
 * standings row and the floating compare bar, without threading state
 * through the server component in app/teams/page.tsx.
 */
export function TeamCompareProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [picked, setPicked] = React.useState<Picked[]>([])

  const toggle = React.useCallback((team: Picked) => {
    setPicked((prev) => {
      const exists = prev.some((p) => p.teamId === team.teamId)
      if (exists) return prev.filter((p) => p.teamId !== team.teamId)
      if (prev.length >= 2) return prev
      return [...prev, team]
    })
  }, [])

  return (
    <CompareContext.Provider value={{ picked, toggle }}>
      {children}
    </CompareContext.Provider>
  )
}

function useCompare() {
  const ctx = React.useContext(CompareContext)
  if (!ctx) {
    throw new Error(
      "TeamCompareCheckbox/Bar must be used inside TeamCompareProvider"
    )
  }
  return ctx
}

export function TeamCompareCheckbox({
  teamId,
  teamName,
}: {
  teamId: number
  teamName: string
}) {
  const { picked, toggle } = useCompare()
  const isPicked = picked.some((p) => p.teamId === teamId)
  const atLimit = picked.length >= 2 && !isPicked

  return (
    <Checkbox.Root
      checked={isPicked}
      disabled={atLimit}
      onCheckedChange={() => toggle({ teamId, teamName })}
      aria-label={`Select ${teamName} to compare`}
      className={cn(
        "flex size-5 items-center justify-center rounded-md border border-input bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
      )}
    >
      <Checkbox.Indicator>
        <CheckIcon className="size-3.5" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  )
}

export function TeamCompareBar() {
  const { picked } = useCompare()
  const router = useRouter()

  if (picked.length === 0) return null

  const [a, b] = picked
  const canCompare = picked.length === 2

  function handleCompare() {
    if (!canCompare) return
    router.push(`/teams/compare?teamA=${a.teamId}&teamB=${b.teamId}`)
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 text-sm shadow-md">
      <span className="font-medium">{a.teamName}</span>
      {b ? (
        <>
          <span className="text-muted-foreground">vs</span>
          <span className="font-medium">{b.teamName}</span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Pick one more team to compare
        </span>
      )}
      <Button
        size="sm"
        disabled={!canCompare}
        onClick={handleCompare}
        className="ml-1"
      >
        Compare
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  )
}

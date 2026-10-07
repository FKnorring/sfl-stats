"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { overrideSteamId } from "./actions"

export function SteamIdEditor({
  rosterEntryId,
  currentSteamid64,
}: {
  rosterEntryId: number
  currentSteamid64: string | null
}) {
  const [steamid64, setSteamid64] = React.useState(currentSteamid64 ?? "")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSave() {
    setPending(true)
    setError(null)
    const res = await overrideSteamId(rosterEntryId, steamid64)
    setPending(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <Input
          value={steamid64}
          onChange={(e) => setSteamid64(e.target.value)}
          placeholder="Steam64 ID (17 digits)"
          className="h-7 w-48 font-mono text-xs"
        />
        <Button
          size="xs"
          onClick={handleSave}
          disabled={pending || steamid64.trim() === (currentSteamid64 ?? "")}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

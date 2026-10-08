"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerMapHeatmap } from "./player-map-heatmap"
import { unlockNetlightHeatmap, type UnlockResult } from "./unlock-actions"

export function NetlightHeatmapGate({ steamid64 }: { steamid64: string }) {
  const [data, setData] = useState<Extract<UnlockResult, { ok: true }> | null>(
    null
  )
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (data) {
    return (
      <PlayerMapHeatmap
        steamid64={steamid64}
        kills={data.kills}
        radars={data.radars}
      />
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const password = new FormData(e.currentTarget).get("password")
        startTransition(async () => {
          const res = await unlockNetlightHeatmap(steamid64, String(password))
          if (res.ok) setData(res)
          else setFailed(true)
        })
      }}
    >
      <p className="text-sm text-muted-foreground">
        Swischa @Bralle 100kr för premium-access till Netlight's data
      </p>
      <div className="flex max-w-xs gap-2">
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="off"
          aria-invalid={failed}
          onChange={() => setFailed(false)}
        />
        <Button type="submit" disabled={pending}>
          Unlock
        </Button>
      </div>
      {failed ? (
        <p className="text-sm text-destructive">Wrong password.</p>
      ) : null}
    </form>
  )
}

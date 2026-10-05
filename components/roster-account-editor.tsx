"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { correctRosterMatch } from "@/app/teams/[name]/actions"

/**
 * Inline (non-modal) steamid64 correction form for one roster row — no
 * Dialog primitive exists in components/ui yet, and this is a single text
 * field, so a toggled-open row beats adding a new UI component for it.
 */
export function RosterAccountEditor({
  teamName,
  rosterEntryId,
  currentSteamid64,
}: {
  teamName: string
  rosterEntryId: number
  currentSteamid64: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [steamid64, setSteamid64] = React.useState(currentSteamid64 ?? "")
  const [note, setNote] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<
    { ok: true; message: string } | { ok: false; error: string } | null
  >(null)

  async function handleSave() {
    setPending(true)
    setResult(null)
    const res = await correctRosterMatch(
      teamName,
      rosterEntryId,
      steamid64,
      note || undefined
    )
    setPending(false)
    setResult(res)
    if (res.ok) setOpen(false)
  }

  if (!open) {
    return (
      <Button
        variant="link"
        size="xs"
        className="h-auto px-0 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2">
      <Input
        value={steamid64}
        onChange={(e) => setSteamid64(e.target.value)}
        placeholder="Steam64 ID (17 digits)"
        className="h-7 text-xs"
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-7 text-xs"
      />
      {result && !result.ok ? (
        <p className="text-xs text-destructive">{result.error}</p>
      ) : null}
      <div className="flex gap-1.5">
        <Button size="xs" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setOpen(false)
            setResult(null)
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

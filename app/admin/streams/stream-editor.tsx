"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import type { StreamAssignment } from "@/lib/stream-message"
import { deleteStream, parseStreams, saveStreams } from "./actions"

export function StreamEditor({
  saved,
}: {
  saved: Record<string, { url: string; caster: string | null }>
}) {
  const [text, setText] = React.useState("")
  const [assignments, setAssignments] = React.useState<StreamAssignment[]>([])
  const [unmatched, setUnmatched] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleParse() {
    setPending(true)
    setError(null)
    setMessage(null)
    const res = await parseStreams(text)
    setPending(false)
    if (!res.ok) return setError(res.error)
    setAssignments(res.assignments)
    setUnmatched(res.unmatched)
    if (res.assignments.length === 0) setError("No upcoming match found")
  }

  async function handleSave() {
    setPending(true)
    setError(null)
    const res = await saveStreams(assignments)
    setPending(false)
    if (!res.ok) return setError(res.error)
    setMessage(res.message)
    setAssignments([])
    setUnmatched([])
    setText("")
  }

  async function handleDelete(matchId: string) {
    const res = await deleteStream(matchId)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste the Discord message here"
        className="w-full max-w-2xl rounded-md border border-input bg-transparent p-2 text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleParse}
          disabled={pending || !text.trim()}
        >
          Parse
        </Button>
        {assignments.length > 0 ? (
          <Button size="sm" onClick={handleSave} disabled={pending}>
            Save {assignments.length} stream(s)
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {assignments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {assignments.map((a) => (
            <li key={a.matchId}>
              {a.teamAName} vs {a.teamBName} —{" "}
              <span className="font-mono">{a.url}</span>
              {a.caster ? ` — ${a.caster}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {unmatched.length > 0 ? (
        <div className="text-sm">
          <p className="text-muted-foreground">Couldn&apos;t match:</p>
          <ul className="list-disc pl-5">
            {unmatched.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h2 className="mb-1 text-sm font-medium">Saved streams</h2>
        {Object.keys(saved).length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {Object.entries(saved).map(([matchId, { url, caster }]) => (
              <li key={matchId} className="flex items-center gap-2">
                <span className="font-mono">{matchId}</span>
                <span className="font-mono text-muted-foreground">{url}</span>
                {caster ? <span>{caster}</span> : null}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleDelete(matchId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

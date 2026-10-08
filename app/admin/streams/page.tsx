import { notFound } from "next/navigation"
import { getMatchStreams } from "@/lib/db"
import { isLocalEnv } from "@/lib/env"
import { StreamEditor } from "./stream-editor"

// Local-only maintenance tool (ADR-0002): 404s unless ENV=local.
export default async function AdminStreamsPage() {
  if (!isLocalEnv) notFound()
  const streams = await getMatchStreams()

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Twitch streams</h1>
      <p className="text-sm text-muted-foreground">
        Paste the Discord announcement. Upcoming matches whose teams are named
        next to a twitch.tv link get a Twitch icon on /matches.
      </p>
      <StreamEditor saved={streams} />
    </div>
  )
}

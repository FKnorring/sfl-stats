import Link from "next/link"
import type { FutureOpponent } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "TBD"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function FutureOpponentsBar({
  opponents,
}: {
  opponents: FutureOpponent[]
}) {
  if (opponents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming matches scheduled.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Upcoming opponents
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {opponents.map((opponent) => (
          <div
            key={opponent.matchId}
            className="flex min-w-48 shrink-0 flex-col gap-2 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{opponent.opponentName}</span>
              {opponent.roundLabel ? (
                <Badge variant="outline">{opponent.roundLabel}</Badge>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatScheduledAt(opponent.scheduledAt)}
            </span>
            {opponent.opponentTeamId != null ? (
              <Button
                size="xs"
                variant="outline"
                render={
                  <Link href={`/teams/${encodeURIComponent(opponent.opponentName)}`}>
                    Scout Opponent
                  </Link>
                }
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

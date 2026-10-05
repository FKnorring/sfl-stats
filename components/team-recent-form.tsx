import type { RecentResult } from "@/lib/db"
import { Badge } from "@/components/ui/badge"

export function TeamRecentForm({ results }: { results: RecentResult[] }) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No completed matches yet.
      </p>
    )
  }

  // getRecentResults returns newest-first; display oldest-first so the
  // streak reads left-to-right chronologically.
  const chronological = [...results].reverse()
  const wins = results.filter((r) => r.result === "win").length

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Recent form
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {chronological.map((r) => (
          <Badge
            key={r.matchId}
            variant="outline"
            title={`${r.result === "win" ? "W" : "L"} ${r.teamScore}–${r.opponentScore} vs ${r.opponentName}`}
            className={
              r.result === "win"
                ? "text-emerald-600"
                : "text-destructive"
            }
          >
            {r.result === "win" ? "W" : "L"} {r.teamScore}–{r.opponentScore}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground">
          {wins}-{results.length - wins} last {results.length}
        </span>
      </div>
    </div>
  )
}

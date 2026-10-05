import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Svenska Företagsligan scouting tool</h1>
          <p>
            Leaderboards built from parsed CS2 demos, matched to scraped league
            rosters.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              render={<Link href="/leaderboard">Player leaderboard</Link>}
            />
            <Button
              variant="outline"
              render={<Link href="/teams">Team standings</Link>}
            />
          </div>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}

import { FavoriteLanding } from "@/components/favorite-landing"

export default function Page() {
  return (
    <FavoriteLanding>
      <div className="flex min-h-svh p-6">
        <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
          <div>
            <h1 className="font-medium">Svenska Företagsligan</h1>
            <p>
              Leaderboards built from parsed CS2 demos by team Netlight, matched
              to scraped league rosters. Anything off in your team? Likely!
              Demoparsing isn&apos;t perfect, we&apos;ll see if we can fix it
              manually. Contact @Knorring or @Bralle on discord.
            </p>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            (Press <kbd>d</kbd> to toggle dark mode)
          </div>
        </div>
      </div>
    </FavoriteLanding>
  )
}

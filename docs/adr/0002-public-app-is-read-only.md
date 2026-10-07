# Public web app is always read-only; writes stay in scripts (and maybe a future local-only admin UI)

The Next.js app (`app/`) only ever reads from the database — it never inserts, updates, or deletes. All writes happen through CLI scripts (`scripts/scrape-roster.ts`, `scripts/ingest-demos.ts`, `scripts/faceit-sync.ts`, and manual data fixes), run locally by a maintainer.

This is a deliberate constraint, not just the current state of things: the goal for the hosted deployment (see #11) is to share a public link to the stats/scouting app with the rest of the league without needing any authentication layer. A read-only app has nothing worth protecting behind a login — there's no mutation an unauthenticated visitor could trigger. Introducing writes from the public app would mean introducing auth, which is explicitly out of scope for this project's goals.

This constraint survives the move to a hosted database (see ADR-0003): the deployed app's connection should use a read-only-scoped credential where the provider supports it, so the guarantee holds at the infrastructure level and not just by convention in application code.

We anticipate wanting a UI for operations that are currently done by hand or via CLI script — e.g. the manual Steam ID correction tool from issue #5 — but any such UI is **local-only**, run by a maintainer on their own machine against the hosted DB with a full-access credential, and is a separate concern from the public-facing app. It is not a reason to relax the public app's read-only constraint.

We considered allowing limited, scoped writes from the public app (e.g. a public correction-suggestion form) to avoid building a separate local UI, but rejected it: any public write surface reopens the question of auth and abuse-handling that read-only sharing was specifically meant to avoid.

The first such tool is `/admin` (`app/admin`): when `ENV=local` it overwrites a roster entry's Steam64 ID in the DB and in `data/player-overrides.json`. It 404s otherwise, and its server action re-checks `isLocalEnv`.

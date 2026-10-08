# sfl-stats

Stats and scouting dashboard for the Svenska Företagsligan (SFL) CS2 league.
Parses match demos, scrapes team rosters, syncs player Faceit stats, and
surfaces leaderboards and team comparisons through a Next.js app.

## How it fits together

- **Data lives in SQLite/libSQL**, via Drizzle ORM
  ([`lib/db/schema.ts`](lib/db/schema.ts), [`lib/db/client.ts`](lib/db/client.ts)).
  By default that's a local file at `data/sfl.db` (gitignored, generated
  locally) — set `DATABASE_URL`/`DATABASE_AUTH_TOKEN` to point at a hosted
  [Turso](https://turso.tech/) database instead (see
  [`.env.example`](.env.example) and
  [docs/adr/0003-hosted-db-turso-libsql-drizzle.md](docs/adr/0003-hosted-db-turso-libsql-drizzle.md)).
- **CLI scripts** (`scripts/`) populate the database: scrape rosters, ingest
  demo files, sync Faceit stats. Each run writes to whichever database
  `DATABASE_URL` points at for that invocation.
- **The Next.js app** (`app/`) only ever reads from the database
  ([`lib/db.ts`](lib/db.ts)) — it never writes to it, by design (see
  [docs/adr/0002-public-app-is-read-only.md](docs/adr/0002-public-app-is-read-only.md)).
  All writes go through the CLI scripts via `openWritableDb()`
  ([`lib/db/client.ts`](lib/db/client.ts)).

```
scrape-roster.ts  →  teams + roster_entries
ingest-demos.ts   →  matches + player_match_stats (+ resolves roster_entries → players)
faceit-sync.ts    →  faceit_match_stats, for players already matched to a steamid64
                              ↓
                     Next.js app (read-only) → leaderboard, team pages
```

### Sources

- [SFL roster page](https://publiclir.se/svenska-foeretagsligan/) — scraped
  by `pnpm scrape:roster` (default `--url`).
- [SFL S09 demos folder](https://djsesport.sharepoint.com/sites/Publiclir/Delade%20dokument/Forms/AllItems.aspx?id=%2Fsites%2FPubliclir%2FDelade%20dokument%2FSvenska%20F%C3%B6retagsligan%2FSFL%20S09%20-%20ALL%2FSFL09_DEMOS&p=true&ga=1) —
  SharePoint folder where match `.dem` files are published. Download into
  the folder passed to `pnpm ingest:demos -- --dir` (see below). Requires
  org access; see [#3](https://github.com/FKnorring/sfl-stats/issues/3) for
  automating this.

## Prerequisites

- Node.js 22.9+
- [pnpm](https://pnpm.io/) 10+

## Setup

```bash
pnpm install
cp .env.example .env
# then fill in FACEIT_API_KEY in .env (see below)
```

### Getting a Faceit API key

1. Go to Faceit's [App Studio](https://developers.faceit.com/) → API Keys.
2. Create a **server-side** API key (not client-side).
3. Put it in `.env` as `FACEIT_API_KEY=...`.

This is only required to run `faceit:sync`. The app and the other scripts
work without it.

### Pointing at a hosted database (optional)

By default everything (app + scripts) talks to the local file at
`data/sfl.db`. To use a hosted [Turso](https://turso.tech/) database
instead, set in `.env`:

```bash
DATABASE_URL=libsql://<db-name>-<org>.turso.io
DATABASE_AUTH_TOKEN=<token from `turso db tokens create <db-name>`>
```

See [docs/adr/0003-hosted-db-turso-libsql-drizzle.md](docs/adr/0003-hosted-db-turso-libsql-drizzle.md)
for the reasoning. Schema changes are applied with `pnpm db:migrate` against
whichever database `DATABASE_URL` points at — run it explicitly, it's never
automatic.

## Running the app

```bash
pnpm dev        # start the dev server at http://localhost:3000
pnpm build      # production build
pnpm start      # run the production build
```

The app reads the database configured by `DATABASE_URL` (local file by
default). If no data exists yet, run the ingestion scripts below first —
the app has nothing to show otherwise.

### Matches

Open `/matches` from the sidebar to see a horizontally scrolling live
Toornament schedule and the ingested-demo history. Division selection and
team-name search update both sections immediately; all divisions are shown
initially. Schedule source data is refreshed about every six hours. Older successful
data can appear during refresh or an outage. If Toornament is
unavailable, history and filters still work. Dates use Stockholm time.

History shows one row per demo, newest first, linking to
`/matches/demo/[matchId]`. Demos attributable exclusively to seasons before
S9 are excluded; unattributed demos remain visible. Unresolved teams use
the same eligible-season roster evidence as demo detail, otherwise appear
as unknown. Tied or conflicting evidence is not guessed; unassignable
players remain visible in detail. Stored scores are labeled **Demo score**.
When both stored scores are absent, a uniquely closest completed Toornament
result for the two teams within four days may be shown as **Official result**.
This may be a series result, not this demo's round score. Partial stored
scores are never combined with official results. Unknown division attribution
cannot satisfy a selected division.

This page does not write to the database or require `scrape:schedule` for
upcoming data. Focused regression checks use an isolated in-memory database:

```bash
node --import tsx --test lib/matches.test.ts
```

## Following teams

Follow teams from `/teams` or a team detail page. `/followed` lists your
followed teams and lets you choose a favorite; `/follow/[team]` opens one
team's dashboard. The first follow is automatically the favorite. Removing
the favorite promotes the oldest remaining follow, and removing the last
follow restores the introductory home page.

The favorite replaces Home in the sidebar and redirects `/` to its
dashboard after browser preferences load. Preferences live only in
localStorage on this browser, with cross-tab updates but no account or
cross-device sync. Existing cookie follows migrate automatically after a
successful storage write. If storage is unavailable, changes are
session-only and a warning is shown. Unreadable preferences are preserved
until you explicitly reset them.

Follows use canonical team names to carry into the current season; resolved
database IDs refresh without changing favorite status or highlight colors.
Unavailable or ambiguous names remain in `/followed` for manual removal,
and an unavailable favorite does not redirect Home to a missing page.
Colored row accents and numbered follow markers identify followed teams
throughout overview tables.

The dashboard combines upcoming matches, all attributed demo history,
official division placement, roster statistics/MVP, and other followed
teams. Schedule and ranking widgets are discovered from publiclir.se's
current-season CS2 embeds and refreshed about every six hours. Older
successful data can appear during refresh or outages. Source failures
are shown explicitly; ingested demo data remains usable. This does not
require a schedule-scrape run or any public database writes.

The demo-stat MVP is ranked by team-attributed demo ADR, then K/D (deaths
clamped to one for ranking), then demos played, then roster-entry ID. It is
not CS2's per-round MVP count. Unmatched players remain listed without
invented statistics. Anchored demo teams take precedence; unresolved demos
use non-conflicting roster evidence. Unanchored demos have no independent
season field, so exact historical attribution may be unavailable.

## Database schema & migrations

The schema is defined in TypeScript at
[`lib/db/schema.ts`](lib/db/schema.ts) — that's the source of truth, not a
hand-written `.sql` file.

```bash
pnpm db:generate   # after editing lib/db/schema.ts, generates a migration under drizzle/
pnpm db:migrate    # applies pending migrations to whichever DB DATABASE_URL points at
```

## Shared caches and ingestion updates

Public database results, Faceit recent-window summaries and successful
Toornament source results refresh on demand about every **six hours**.
Steam profiles and demo kill-event data refresh about every **24 hours**.
These are refresh targets, not strict age limits: a request can receive
older successful data while background refresh runs or an upstream source
is unavailable. A cache miss still pays the query/network cost. Caching
does not make the ingested Faceit snapshot newer than its sync schedule.

The app uses Next.js Data Cache, managed by Vercel in production. Pages
remain request-rendered so URL filters and browser-local follows behave
as before. Every fresh server request reads one small `cache_generation`
row; all heavier queries reuse generation-keyed cached results. Each
write-capable ingestion run advances that marker, including overrides,
kill backfills, team re-resolution and partially failed runs. An old query
finishing after ingestion cannot refill the current generation's cache.
The public app only **reads** this marker with its read-only credential.

### Production setup

1. Apply `0007_cache_generation.sql` (after the ratings migration `0006`)
   with `pnpm db:migrate` against the target Turso
   database using the maintainer's full-access credential **before deploying
   this app version or running the updated ingestion scripts**.
2. Set a strong random `CACHE_REVALIDATION_SECRET` in the Vercel production
   environment and your local untracked `.env`. Use a different secret for
   a preview/test deployment; never prefix it with `NEXT_PUBLIC_`.
3. Set `CACHE_REVALIDATION_URL=https://<production-domain>/api/revalidate`
   locally. Use the direct HTTPS production domain, not a redirecting alias.
   The deployed app does not need this URL.
4. Use the same `DATABASE_URL` and `CACHE_NAMESPACE` on both sides.
   The namespace defaults to `FKnorring/sfl-stats`; set a different one for
   unrelated projects. Production and preview should use separate databases.
   Requests with the wrong database/namespace scope are rejected.
5. Deploy with a read-only Turso credential; keep the writable credential
   only on the ingestion machine. Run ingestion normally.

All five ingestion/enrichment commands load `.env` if present; already-exported
environment variables take precedence. They notify the protected endpoint
after the write phase, expiring DB tags immediately and also Toornament
tags for roster/schedule runs. The generation change independently
invalidates DB and Toornament cache keys across instances. Steam profile
caches keep their 24-hour lifetime.

Both callback settings may be omitted for local-only development; the
script logs that notification is disabled but still advances the local
generation marker. A partially configured callback fails before writes.
Local `file:` database runs cannot notify a deployed app. The endpoint
cannot write to the database or accept arbitrary cache tags/paths.

After successful ingestion, the next fresh load/reload reads updated DB
data without a redeploy. Tag invalidation can take roughly 300 ms to
propagate between Vercel regions. Requests already in flight and open tabs
may retain older data. The player hover-card cache stays tab-local, while
its HTTP endpoint uses `no-store` so a reload does not reuse a separate
browser/CDN response cache.

The `ENV=local` admin Steam ID editor uses the same write-phase wrapper,
including generation advancement and optional notification after partial
failure. Its existing local-only guard remains; production app requests
cannot use it to write to the database.

### Failure recovery

Failures after writes are explicit and return a nonzero exit code; earlier
commits are not rolled back. Even a partial ingestion attempts the
generation update and cache notification. If notification fails, correct
the endpoint/secret/target and retry without parsing or syncing again:

```bash
pnpm cache:revalidate -- --source demos
# source is demos, roster, schedule, or faceit
```

This command advances the generation again and retries the authenticated
notification. If the generation update failed, apply migrations/fix DB
access before retrying. Manual DB edits outside the ingestion scripts also
need this command. Do not purge the entire Vercel team cache as routine
recovery; caches can be shared with other projects.

### Cache regression and performance checks

```bash
pnpm test         # isolated query, source, endpoint and notifier regressions
pnpm build
pnpm test:cache   # production-mode integration using an isolated fixture
```

`test:cache` starts temporary loopback servers and an in-memory database,
measures 14 routes (including home and rating-filtered leaderboard),
checks cache sizes/lifetimes, performs authenticated CLI
invalidation, and reproduces a query finishing after invalidation. It also
checks source-outage recovery and Faceit serialization. No production DB
or external API is used. Reported timings use a simulated 40 ms upstream
delay; they are not production latency claims. Warm loads should make one
generation query and no repeated aggregate, Steam or Toornament calls.
Response serialization/table rendering can still dominate large pages.

## Scripts

All scripts are run with `pnpm <script>` and write to whichever database
`DATABASE_URL` points at (the local file by default), creating it (once
migrated) on first run if needed.

### `pnpm scrape:roster`

Scrapes team rosters from the SFL site and upserts `teams` +
`roster_entries`.

```bash
pnpm scrape:roster
pnpm scrape:roster -- --url https://publiclir.se/svenska-foeretagsligan/
```

- `--url` — defaults to the current SFL roster page
  ([`scripts/scrape-roster.ts`](scripts/scrape-roster.ts)).

### `pnpm scrape:schedule`

Scrapes upcoming/completed match data from the Toornament schedule widget
publiclir.se embeds (`widget.toornament.com`, server-rendered, no API key
needed) and upserts `toornament_matches`. Opponent team names are
fuzzy-matched against the current season's `teams` rows (same similarity
scoring as roster matching); unresolved sides are kept as raw names with no
team link.

```bash
pnpm scrape:schedule
pnpm scrape:schedule -- --tournament-id 2560854090247290879
```

- `--tournament-id` — defaults to the current SFL CS2 tournament
  ([`scripts/scrape-schedule.ts`](scripts/scrape-schedule.ts)).
- `--locale` — widget locale, defaults to `en_US`.
- Powers the "Upcoming opponents" bar on `/teams/[name]`.

### `pnpm ingest:demos`

Parses `.dem` files, writes `matches` + `player_match_stats`, and attempts
to match in-demo player names to roster entries (nickname similarity, see
[`lib/matching.ts`](lib/matching.ts)).

```bash
pnpm ingest:demos
pnpm ingest:demos -- --dir ./demos
```

- `--dir` — folder to scan recursively for `.dem` files. Defaults to
  `./demos`, or `$DEMOS_DIR` if set
  ([`scripts/ingest-demos.ts`](scripts/ingest-demos.ts)).
- Demos are matched against roster entries by nickname similarity. After a
  run, check the console summary for `auto_low` / `ambiguous` / `unmatched`
  counts — those need manual review (see
  `data/player-overrides.json`, the git-tracked manual-correction file the
  script reads back in on subsequent runs).

### Player ratings

Demo scoreboards, player profiles/history, leaderboards, shared team rosters,
and recent-game hover cards show **SFL Rating v1**, a custom provisional model,
**not an official HLTV rating**. Select SFL Rating in the leaderboard filter
to rank by it; existing defaults and ADR-based team MVP selection are unchanged.
Demo detail includes the selected player's component breakdown, KAST, openings,
clutches, flash assists, and utility damage.

The rating combines combat (25%), damage (20%), KAST consistency (20%),
survival (10%), impact (15%), and support (10%), relative to a frozen SFL09
reference corpus. A reference-average performance is 1.00. Profile/roster
averages are weighted by participated rounds; `rated/all` shows demo coverage.
Unreliable or incomplete recordings remain visible but unrated with an
explanation. Faceit statistics and series results are not rated.

Apply the generated migration before running the new code. New demo ingestion
automatically calculates ratings. To enrich already-ingested demos, download
the originals and run:

```powershell
pnpm db:migrate
pnpm rate:demos --dir "C:\path\to\SFL09_DEMOS" --dry-run
pnpm rate:demos --dir "C:\path\to\SFL09_DEMOS"
pnpm rate:demos --recompute
```

`--match-id <id>` limits either operation to one existing demo.
`--dry-run` parses/calculates without writing. `--recompute` needs only stored
round facts, not original files. The CLI reads `.env` and uses the same
`DATABASE_URL` as the other scripts. Back up the selected database first.
Duplicate normalized demo basenames are rejected; Unicode filename composition
differences are normalized for lookup. Re-enrichment is atomic per demo and
idempotent, and never replays roster matching or duplicates heatmap events.
Missing originals, invalid recordings, and enrichment failures are explicitly
reported; unexpected failures produce a failing exit status.

Ratings use validated competitive rounds, not legacy `matches.total_rounds`:
some demos contain an initial synthetic round-end event with no winner.
Existing aggregate stats/heatmaps remain unchanged. Verified players absent
from the final scoreboard can be added from their participated-round facts.
Economy snapshots are retained but not weighted.

See [the rating decision](docs/adr/0006-versioned-sfl-player-rating.md) for
definitions, calibration limitations, and the frozen reference inventory.
Focused tests, with optional reproduction against original demos:

```powershell
node --import tsx --test lib\player-rating.test.ts lib\rating-db.test.ts
$env:SFL_RATING_DEMOS = "C:\path\to\SFL09_DEMOS"
node --import tsx --test lib\player-rating.test.ts
```

### `pnpm faceit:sync`

Fetches Faceit lifetime stats and recent match history for players already
matched to a `steamid64`, and writes `faceit_match_stats`.

```bash
pnpm faceit:sync
pnpm faceit:sync -- --days 14
pnpm faceit:sync -- --force
pnpm faceit:sync -- --probe <steamid64>
```

- `--days` — how many days of recent match history to pull (default `7`).
- `--max-age-hours` — skip players synced more recently than this (default
  `12`), unless `--force` is passed.
- `--force` — ignore the freshness cap and resync everyone.
- `--steamid <id>` — sync only this one player.
- `--probe <steamid64>` — dumps raw Faceit API responses for one player with
  **no DB writes**. Run this first after setting `FACEIT_API_KEY` to confirm
  the key works and sanity-check the response shape.

This script requires `FACEIT_API_KEY` to be set in `.env` or the environment.
Its read-only `--probe` does not advance the generation or notify caches.

`rate:demos` enrichment and `--recompute` use the same invalidation wrapper
and `demos` notification source, including partially failed runs.
`rate:demos --dry-run` neither advances the generation nor notifies caches.

## Other useful commands

```bash
pnpm lint        # eslint
pnpm format      # prettier --write
pnpm typecheck   # tsc --noEmit
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

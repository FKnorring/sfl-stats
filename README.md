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

- Node.js 22+
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

## Database schema & migrations

The schema is defined in TypeScript at
[`lib/db/schema.ts`](lib/db/schema.ts) — that's the source of truth, not a
hand-written `.sql` file.

```bash
pnpm db:generate   # after editing lib/db/schema.ts, generates a migration under drizzle/
pnpm db:migrate    # applies pending migrations to whichever DB DATABASE_URL points at
```

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

This script requires `FACEIT_API_KEY` to be set in `.env` — it's run via
`node --env-file=.env`, so no extra setup beyond the `.env` file is needed.

## Other useful commands

```bash
pnpm lint        # eslint
pnpm format      # prettier --write
pnpm typecheck   # tsc --noEmit
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

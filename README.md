# sfl-stats

Stats and scouting dashboard for the Svenska Företagsligan (SFL) CS2 league.
Parses match demos, scrapes team rosters, syncs player Faceit stats, and
surfaces leaderboards and team comparisons through a Next.js app.

## How it fits together

- **Data lives in SQLite** at `data/sfl.db` (gitignored, generated locally —
  see [`lib/schema.sql`](lib/schema.sql) for the schema).
- **CLI scripts** (`scripts/`) populate the database: scrape rosters, ingest
  demo files, sync Faceit stats.
- **The Next.js app** (`app/`) only ever reads from the database
  ([`lib/db.ts`](lib/db.ts)) — it never writes to it. All writes go through
  the CLI scripts via [`scripts/db-writable.ts`](scripts/db-writable.ts).

```
scrape-roster.ts  →  teams + roster_entries
ingest-demos.ts   →  matches + player_match_stats (+ resolves roster_entries → players)
faceit-sync.ts    →  faceit_match_stats, for players already matched to a steamid64
                              ↓
                     Next.js app (read-only) → leaderboard, team pages
```

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) 10+
- `better-sqlite3` ships a native binary — if `pnpm install` complains about
  build scripts, approve it (`pnpm.allowBuilds` is already set in
  `pnpm-workspace.yaml` for the packages this project needs).

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

## Running the app

```bash
pnpm dev        # start the dev server at http://localhost:3000
pnpm build      # production build
pnpm start      # run the production build
```

The app reads `data/sfl.db` directly. If that file doesn't exist yet, run
the ingestion scripts below first — the app has nothing to show otherwise.

## Scripts

All scripts are run with `pnpm <script>` and write to `data/sfl.db`,
creating it (and the schema) on first run if needed.

### `pnpm scrape:roster`

Scrapes team rosters from the SFL site and upserts `teams` +
`roster_entries`.

```bash
pnpm scrape:roster
pnpm scrape:roster -- --url https://publiclir.se/svenska-foeretagsligan/
```

- `--url` — defaults to the current SFL roster page
  ([`scripts/scrape-roster.ts`](scripts/scrape-roster.ts)).

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

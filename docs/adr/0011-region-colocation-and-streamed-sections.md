# Co-locate functions with the database and stream page sections

## Decision

Pin Vercel Functions to `arn1` (Stockholm) in `vercel.json`, the same region as
the Turso database (`aws-eu-north-1`), the Toornament/Steam audience and the
league's users. Production previously ran in the default `iad1` (US East), so
every remote-cache lookup and every Turso query on a miss crossed the Atlantic.

Pages render a static shell and stream independent data sections through
`<Suspense>` boundaries. A section awaits only what it depends on; independent
fetches start together (`Promise.all` or a promise started before an earlier
`await`). Live Toornament/Steam sources never gate unrelated sections. Queries
select only the rows a page renders (`LIMIT`, division filter, ID-filtered
Faceit lookups), and client components only receive the subset they display.

## Why

A fetch audit (issue #83) measured every Turso query at 10–70 ms with payloads
≤56 KB, yet each warm page added 250–450 ms of dynamic render time. The cost was
serial cross-region hops, not query work. Region co-location removes most of the
per-hop latency; flattening waterfalls removes hops.

## Consequences

- Next.js `preferredRegion` is not used: on Vercel it only accepts
  `auto`/`global`/`home`; `vercel.json` `regions` is the supported setting.
- Moving the database requires moving `regions` with it.
- Per-section skeletons replace a single whole-page loading state.
- Pagination remains out of scope (ADR-0004, ADR-0006). Filters that must share
  state across sections (the matches page, ADR-0006) stay in one boundary.

# Shared Data Cache with an ingestion generation marker

Issue #69 introduces six-hour refresh targets for reusable DB/Faceit and
Toornament data, and 24-hour targets for Steam profiles and kill-event
facts. This explicitly supersedes ADR-0006/0007's five-minute Toornament
fetch policy. Their read-only, client-filtering, official-source and
explicit-unavailability principles remain unchanged.

## Cache boundaries

Use the existing Next.js Data Cache model (`unstable_cache`) while Cache
Components is disabled. Although Next.js 16 recommends `use cache`, that
migration would also change route/runtime/Suspense boundaries and require
remote cache selection on Vercel. It is not needed for shared persistence
in the current model.

Typed app-only wrappers cache serializable raw-query results; injected DB
test seams stay usable without Next.js. Faceit Maps are converted to entry
arrays and reconstructed after reads. Player kill histories use per-demo
entries so they do not become one unbounded cache item. Source caches hold
validated successful data, not transport/HTTP/parser failures disguised
as empty results. Time-dependent Faceit windows retain finite expiry.

Public routes use `connection()` rather than `force-dynamic`, which can
disable explicit cache reads. Server rendering and browser-local follow
preferences stay intact. No full-page/CDN cache is added; the hover-card
endpoint requires a fresh origin request while sharing its underlying
cached data. Existing tabs need not update immediately.

## Why tag invalidation alone is insufficient

The production-mode integration harness reproduced a late-fill race:
a DB query started before ingestion can finish after `revalidateTag()`
and republish the old result as a new cache entry. A TTL cannot provide the
agreed post-ingestion reload guarantee.

Add a singleton `cache_generation` row populated by migration. CLI scripts
and the existing `ENV=local` admin editor update it, using a new random
generation after write-capable phases, including partial runs. The public
app reads it once per render request
using React request memoization, or an AsyncLocalStorage scope for Route
Handlers. DB and Toornament cache keys include that generation. Late
results stay in the obsolete keyspace and are never reused by later fresh
requests. Concurrent runs can each advance the marker safely.

This is a deliberate change from the original all-query cache-hit goal:
one small fresh DB lookup per request is retained to ensure consistency
across Vercel instances without writable app credentials. The representative
fixture confirms heavier queries and external calls disappear on warm
loads; rendering, payload size and this last DB round trip remain. It does
not provide an atomic whole-ingestion snapshot or recall in-flight pages.

## Operational invalidation

All four ingestion entry points use a shared write-phase wrapper. It
advances the generation after writes and calls an authenticated, bounded
POST endpoint with an allowlisted source and hashed project/database scope.
The local-only admin editor uses this wrapper too, so its committed roster
corrections do not remain hidden behind persistent data caches. Its
existing production write prohibition remains unchanged.
DB tags are broadly expired; roster/schedule notifications also expire
Toornament tags. Broad generation changes conservatively refresh
Toornament keys after other ingestion types too. Steam retains its separate
24-hour cache because ingestion does not update Steam profiles.

The endpoint uses `revalidateTag(tag, { expire: 0 })`, never the deprecated
single-argument form. Authentication precedes parsing/invalidation; input
cannot select arbitrary tags/paths. Scope mismatches fail explicitly.
Callback settings are optional together for local-only use, but partial
configuration fails preflight. Local-file runs cannot notify production.
Secrets stay server/local-only and are not cache key arguments.

The marker protects DB consistency even if a callback fails, but callbacks
remain useful for provider invalidation/cleanup. Errors after committed
writes are nonzero and preserve both ingestion and notification failures.
The standalone retry command advances the generation and notifies without
reingesting. Read-only Faceit probes do neither.

Apply migrations before deploying this version. ADR-0002 is preserved:
the public app never writes to Turso, including the generation row, and
retains its read-only credential. The cache endpoint only affects cache
state. Freshness targets remain request-triggered and allow older successful
data during background refresh/outages; they are not ingestion schedules.

We rejected Redis, a generic cache adapter, per-entity invalidation graphs,
browser polling, and full-site Cache Components migration for this change.
The implementation uses the existing platform, schema tooling and test
runner, with no new runtime dependency.

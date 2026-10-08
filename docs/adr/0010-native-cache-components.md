# Native Cache Components with eventual tag revalidation

## Decision

Enable Cache Components and Partial Prefetching on the pinned Next.js 16.3.6.
Replace application `unstable_cache` wrappers with explicit async
`"use cache: remote"` functions, `cacheLife`, and `cacheTag`. Vercel provides
the managed remote handler; local execution uses the default in-memory handler.
No new runtime dependency or custom production cache infrastructure is added.

This explicitly supersedes ADR-0009's old Data Cache engine, generation marker,
whole-route request-rendering policy, and next-reload freshness guarantee.
The migration was previously deferred because it required rendering-boundary
work and a remote storage choice. The requested whole-application rebuild
includes that work, and the maintainer explicitly accepted eventual freshness.

## Boundaries and lifetimes

Cache successful, validated source results at the data layer. DB/Faceit and
Toornament use the `current` profile (six-hour revalidation); Steam profiles and
per-demo kill facts use `stable` (24-hour revalidation). Both use `stale: 300`
for client navigation and inherit Next.js's default non-expiring hard lifetime.
Provider eviction can still force a fresh read; no indefinite storage guarantee
is implied. Native directive keys include build/deployment identity and do not
carry over to a new deployment.

Database/namespace scope is hashed, passed explicitly as a cache-key argument,
and used to construct tags. Secrets never become cache arguments. Keep normalized
filters, Steam's sorted/deduplicated 100-player batches, bounded per-demo kill
entries, and serializable Faceit entry arrays. Raw query modules remain usable
without a Next.js cache execution context.

The shared catalog can contribute to the static shell. The root loading
boundary contains page-level runtime params, search params, and uncached reads.
Optional Steam and Toornament presentations explicitly defer to request time:
an unavailable-source fallback must not become permanent prerendered UI.
Failures throw inside cached scopes; established logged presentation fallbacks
remain outside them. No blanket page cache or second persistent fetch layer is
added. The hover-card GET remains dynamic and HTTP `no-store`, while successful
cards retain their existing tab-local reuse.

## Revalidation and consistency

The protected, bounded, scoped POST endpoint uses
`revalidateTag(tag, "max")`. Demos/ratings and Faceit mark DB data stale;
roster/schedule also mark Toornament stale. Steam remains independent.
The CLI write-phase wrapper retains preflight validation, partial-write
notification, retries, acknowledgement checks, and aggregate error reporting.
Read-only probes and dry runs never notify. The standalone retry only notifies.

Delete the generation reader, AsyncLocalStorage scope, and generation writes.
There is no fresh DB round trip solely to choose a key. This intentionally
removes ADR-0009's independent consistency protection when a callback fails or
a late read finishes. Revalidation is native and eventual; the first subsequent
request may be stale. A successful acknowledgement confirms acceptance, not
global convergence or an atomic ingestion snapshot.

The local-only admin Server Action uses `updateTag` for immediate local
read-your-own-writes after write-capable phases, including partial failures.
It may also notify a separate deployed app through the existing CLI wrapper.
Public writes remain forbidden and deployed credentials remain read-only.

## Schema and rollout

Remove the schema declaration and generate a forward migration dropping only
`cache_generation`; keep every historical migration unchanged. Deploy the
generation-free app and update ingestion scripts before applying the drop.
Retire older deployments/scripts first. The new app also works with the unused
table present, allowing staged deployment and rollback before schema cleanup.

## Preserved decisions and verification

Preserve ADR-0002/0003's read-only production and Drizzle migration policy,
ADR-0004's server-selection/client-sorting split, ADR-0006/0007's explicit
source availability and browser-local follows, and ADR-0008's result provenance.
No browser polling, forced tab refresh, rating changes, or UI redesign.

The isolated production harness builds against fixture sources and checks warm
reuse, native tag convergence, late-fill behavior, source recovery, serialization,
HTTP policy, and privacy. Local memory-cache checks cannot establish Vercel
cross-instance propagation, eviction behavior, or serialized provider limits;
those require an isolated preview check before production rollout.

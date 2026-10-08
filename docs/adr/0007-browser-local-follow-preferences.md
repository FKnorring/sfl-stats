# Browser-local follows and favorites with official live rankings

Issue #57 extends the existing follow feature with one favorite and a
per-team dashboard. Follow preferences move from server-action cookies to
versioned localStorage. A single React provider uses `useSyncExternalStore`
for deterministic server rendering, browser hydration, and cross-tab
updates. Preference mutation never writes to the public database (ADR-0002).

Canonical team names are the cross-season follow identity. Current-season
team metadata resolves database IDs for row highlighting. ID changes retain
the favorite and assigned color slot; missing or ambiguous names are not
fuzzy-migrated or silently removed. The first follow is favorite, and
unfollowing it promotes the oldest remaining follow.

localStorage is the only durable preference source. Existing cookie names
are migrated only when there is no saved local state; cookies are cleared
after successful persistence. Storage errors are visibly session-only.
Malformed or unsupported saved preferences are not overwritten without an
explicit reset. A cookie mirror was rejected because server personalization
is unnecessary for these browser-specific preferences.

The favorite controls a client redirect from `/` after hydration and
replaces the Home navigation entry. Without a resolvable favorite, Home
remains usable rather than redirecting to an unavailable dashboard.

Official division rank comes from Toornament's public stage widget, not
from reconstructing ranking rules from ingested results. The current-season
CS2 division embeds on publiclir.se identify the stage and tournament.
Fetches retain a five-minute cache and explicit source-failure states.
Request-time DB reads use `connection()` rather than `force-dynamic` so
they do not disable that cache (ADR-0006).

Existing table wrappers own follow styling, using their canonical team IDs
and the generic DataTable's row-class hook (ADR-0004). Persistent color
slots and numbered markers distinguish teams without relying on color
alone. No table engine, runtime dependency, database table, or ingestion
pipeline change is required.

ADR-0009 supersedes this decision's five-minute source-refresh interval
with shared six-hour source caches and ingestion-triggered invalidation.
Browser-local preference storage, official ranking provenance and explicit
source-failure behavior remain unchanged.

# Shared demo identities and explicit result provenance

Issue #65 reproduced history/detail disagreement caused by latest-scraped
rosters selecting pre-S9 identities over available eligible-season entries.
History rejected those identities, while detail independently guessed team
names and side ordering and displayed an inferred Toornament score.

Both history and detail now use the same read-only resolver in `lib/db.ts`.
Roster evidence prefers the highest available season, then scrape time and
entry ID. Stored team identities remain authoritative. Unique roster-vote
winners resolve missing identities; tied votes, duplicate opposing teams
and ambiguous stored-team side anchors are not guessed. Detail groups
players by resolved sides, not the highest-kill player's side. Unassignable
players remain visible separately. Existing pre-S9 eligibility remains.

This explicitly reopens ADR-0006's stored-only history score policy.
Consistency must not come from mislabeling an official series result as a
per-demo round score: stored scores have `demo` provenance, and only when
both scores are absent may the uniquely closest completed Toornament result
for both team names within four days have `official` provenance. The result
is oriented to the resolved teams, and equal-distance candidates or
ambiguous orientation remain unresolved. Partial stored scores are never
mixed with official scores.

History labels each available score **Demo score** or **Official result**;
detail explicitly marks an official fallback. Both explain that official
results may describe a series. Missing evidence remains explicit.

This requires no schema, dependency, ingestion or public-database writes.
Official candidates are fetched once per history query rather than once
per demo. Detail restricts the shared resolver to its requested demo.

# Cohesive Demo ingestion modules and final Matching outcomes

## Decision

Keep `scripts/demos/ingest-demos.ts` as the executable command, with arguments,
recursive/symlink-aware discovery, overrides-file validation, writable database
setup, the existing cache write-phase wrapper and console reporting.

Extract three CLI-only plain-function modules:

- `player-matching.ts` owns override database application, current-season
  candidate selection, claimed-entry removal, roster writes and per-Demo
  Matching outcomes.
- `team-resolution.ts` owns stable-side anchoring, round-score attribution,
  completed-Toornament opponent inference and prior-resolution conflicts.
- `ingestion.ts` owns match/Player/stat/kill persistence, rating persistence
  calls, inventory snapshots and first-ingestion/backfill/rerun routing.

First ingestion and reruns use the same team-resolution implementation and
resolved-team persistence. Existing extraction, nickname Matching, side
schedule, pure anchoring and rating modules remain authoritative.
No classes, generic repository adapter, dependency container, new dependency
or database migration is needed.

ADR-0013 supersedes this ADR's decision to omit whole-Demo transactions and
retain Matching summaries from failed Demo attempts. The module ownership,
CLI boundary, and other preserved semantics below remain.

## Approved behavior changes

Matching summaries count a Player's final outcome once per processed Demo.
An anchoring upgrade replaces the earlier unmatched/ambiguous classification;
it is not an additional Player. The same Player in another processed Demo
contributes again. Team-resolution reruns seed outcomes from stored roster
evidence and update them after anchoring; untouched Demos and kill-only
backfills contribute no Matching outcomes.

Multiple Roster Entries linked to one Player do not multiply the summary.
Existing evidence uses manual > auto_high > auto_low > ambiguous > unmatched
precedence for reporting only. File overrides imply manual status. This does
not change how the rerun query chooses team evidence. A failed Demo contributes
no Matching outcomes; outcomes are reported only after its transaction commits.

A stable side must have a unique highest roster-team vote before its other
Players' nickname candidates are narrowed to that team. A tied highest vote
does not pick the first team; lower-ranked tied votes do not prevent a unique
highest anchor. This does not change the existing per-round side-vote policy
used for score attribution.

## Preserved semantics

Preserve ADR-0001's exact/fuzzy nickname tie distinction, ADR-0002/0003's
CLI-only writes and Drizzle/libSQL persistence, ADR-0008's explicit identities
and score provenance, and ADR-0010's eventual cache invalidation. Do not
restore ADR-0009's superseded generation marker.

Argument defaults, timestamp parsing, basename identity, inventory snapshots,
processing order, candidate eligibility, manual overrides, nullable scores
and conflict messages remain unchanged. An inferred opponent does not provide
an official series score as a Demo score.

Reruns reuse stored kills but still parse round ends and side snapshots.
Per-file failures continue to later Demos and remain explicit in the command's
aggregate error. The runner returns collected failures with its counters so
the command reports before throwing. Rating replacement retains its existing
atomic behavior; ADR-0013 brings it into the enclosing ingestion transaction.

## Verification and alternatives

Use real migration-backed local libSQL databases and narrowly typed native
extraction/snapshot functions with fixture implementations for tests. The
interface is the test surface: assert stored facts, Matching outcomes,
resolution/provenance and batch routing instead of internal helper call counts.
Child-process tests isolate the command's database, directory and environment.

A file-per-helper split was rejected because it would scatter candidate policy
and write ordering without hiding complexity. A generic database repository
would duplicate the existing libSQL/Drizzle interface. ADR-0013 separately
reopens per-Demo transaction boundaries; timezone changes, cross-season rerun
changes and duplicate-basename policy changes remain out of scope.

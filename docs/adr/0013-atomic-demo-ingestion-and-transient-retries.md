# Atomic Demo ingestion and transient database retries

## Decision

Run each Demo parse/reparse persistence operation in one Drizzle/libSQL
transaction. Include match metadata, player and roster matching writes, player
stats, kills, team resolution and rating facts. Rating persistence exposes a
transaction-scoped helper so this operation does not nest transactions.
Kill backfills and team re-resolution also use transactions; a retried kill
backfill replaces its kill rows so a lost commit response cannot duplicate them.

Retry a transaction up to three total attempts only when a nested libSQL error
contains a known transient network code (`UND_ERR_SOCKET`,
`UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EPIPE`,
or `EAI_AGAIN`). Wait 250 ms and then 500 ms between attempts. Do not retry SQL,
parsing, or other non-transient errors. Retry the read-only ingestion preflight
under the same transient-only limit.

An error around commit can leave the client unsure whether the server committed.
Each transaction attempt therefore resolves the match again by its unique
filename. A match found on a retry is reparsed within the transaction, replacing
the prior attempt's persisted facts instead of inserting a duplicate. Attempt
local Matching summaries are merged only after the transaction commits.
Exhausted failures remain logged, collected per file, and do not prevent later
Demos from being attempted.

## Consequences

Failed per-Demo writes no longer leave incomplete matches or roster claims.
Network requests still fail the command after bounded retries, and the CLI
continues to report the failure rather than presenting a successful fallback.
Transactions add begin/commit work and hold the remote transaction open during
the Demo's persistence and resolution operations. Retry applies to ingestion
operations, not unrelated CLI writes such as override application.

This supersedes ADR-0012's decision to omit whole-Demo transactions and its
failed-attempt Matching summary behavior. ADR-0012's module boundaries,
CLI-only writes, ordering, and non-transactional routing semantics remain.
No schema migration or dependency is required.

Always read this entire directory (`docs/adr/`) before making a decision that could conflict with a past one — new architecture, a new dependency, a workflow or tooling change, or anything touching an area an existing ADR already covers. These are accepted decisions, not suggestions: don't silently contradict one. If your work conflicts with an ADR, say so explicitly and explain why reopening it is warranted, rather than overriding it quietly.

When a decision here is final, add a new ADR with the next sequential number (check this index — and the files on disk — for the current max, since a concurrent branch may have already taken the number you expected) and add it to the index below.

## Index

| #    | Title                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | [Auto-link exact-score ties in player Matching; flag fuzzy-score ties for review](0001-tied-match-tiebreak-by-exactness.md)             |
| 0002 | [Public web app is always read-only; writes stay in scripts](0002-public-app-is-read-only.md)                                           |
| 0003 | [Hosted database: Turso (libSQL) + `@libsql/client` + Drizzle, TS-schema-first migrations](0003-hosted-db-turso-libsql-drizzle.md)      |
| 0004 | [DataTable abstraction on TanStack Table v8, sorting split from server-side data selection](0004-data-table-tanstack-react-table-v8.md) |
| 0005 | [Auto-format and lint files via a Claude Code PostToolUse hook, shared project-wide](0005-auto-format-lint-posttooluse-hook.md)         |
| 0006 | [Matches page: cached live schedule and shared client-side filters](0006-matches-live-schedule-shared-filters.md)                       |
| 0007 | [Browser-local follows and favorites with official live rankings](0007-browser-local-follow-preferences.md)                             |
| 0008 | [Shared demo identities and explicit result provenance](0008-shared-demo-identities-and-result-provenance.md)                           |
| 0009 | [Shared Data Cache with an ingestion generation marker](0009-generation-keyed-data-caches.md)                                           |
| 0010 | [Native Cache Components with eventual tag revalidation](0010-native-cache-components.md)                                               |
| 0011 | [Co-locate functions with the database and stream page sections](0011-region-colocation-and-streamed-sections.md)                        |

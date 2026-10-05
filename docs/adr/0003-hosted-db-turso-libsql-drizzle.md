# Hosted database: Turso (libSQL) + `@libsql/client` + Drizzle, TS-schema-first migrations

The app currently reads/writes a local SQLite file (`data/sfl.db`) via `better-sqlite3`, with a read-only connection for the app and a separate writable connection for CLI scripts (see ADR-0002). This doesn't work for a serverless deployment (#11) or for sharing one dataset across a team, so the database needs to move to a hosted provider (#10).

## Provider: Turso

Turso (hosted libSQL — a SQLite fork) was chosen over hosted Postgres (Supabase/Neon). The existing schema and queries (`lib/schema.sql`, hand-written joins/aggregates in `lib/db.ts`) are built around SQLite semantics. Turso lets that port with near-zero rewrite while still providing a hosted, networked database with backups — Postgres would mean translating types and query style for a stats dashboard that has no need for Postgres-specific features (JSONB, extensions, heavy concurrent writers).

## Driver: `@libsql/client`, no custom adapter

`better-sqlite3` is dropped entirely in favor of `@libsql/client`, used for both the local file and Turso. libSQL's client already talks to a local file (`file:data/sfl.db`) or a remote Turso database (`libsql://...`) through the same API — switching is just a different connection URL plus an auth token for the remote case. A hand-rolled adapter around `better-sqlite3` would duplicate what libSQL already provides, and a driver swap would still have been needed to reach Turso.

Local vs. hosted is selected by one env var, `DATABASE_URL` (plus `DATABASE_AUTH_TOKEN` for Turso):
- unset / `file:data/sfl.db` → local SQLite file (dev/test default, no token needed)
- `libsql://<db>.turso.io` → hosted Turso

## ORM: Drizzle, TS-schema-first

Drizzle was chosen over Prisma: it has native, mature libSQL/Turso support (`drizzle-orm/libsql`, no driver-adapter indirection like Prisma's `@prisma/adapter-libsql`), and its SQL-like query builder maps closely to the raw SQL already written by hand in `lib/db.ts` (joins, aggregates, named params) — lower translation effort than Prisma's more abstracted model API.

Schema is TS-schema-first: `lib/schema.sql` is introspected once to bootstrap a Drizzle TS schema, then retired. From that point, `drizzle-kit generate` produces migrations from the TS schema, and `drizzle-kit migrate` applies them. We rejected keeping `schema.sql` hand-maintained alongside an introspected TS mirror — two parallel sources of truth for the same schema invites drift.

## Read-only enforcement without a driver flag

`better-sqlite3`'s `readonly: true` has no libSQL equivalent. The app's Drizzle instance is enforced read-only by convention (app code only issues `select`s) plus, for the deployed app, a Turso auth token scoped to read-only access. CLI scripts get a separate connection with a full-access token. This is weaker locally than the previous hard `readonly: true` guarantee, but regains an infrastructure-level guarantee for the hosted deployment that actually matters (see ADR-0002).

## Data cutover and ongoing ingestion

Moving existing data to Turso is a one-time operation, not an ongoing sync: migrations are applied to the empty hosted database first, then a data-only dump (`INSERT`s) from the local `sfl.db` is replayed into Turso. After cutover, CLI ingestion scripts write to whichever database `DATABASE_URL` points at for that invocation — local SQLite is for throwaway/test runs, Turso for real ingestion. Schema changes are applied to Turso with a manual `db:migrate` script, run explicitly rather than automatically on deploy or boot.

We considered keeping local ingestion as the standing workflow with periodic re-syncs to Turso, but rejected it in favor of making the hosted database directly writable by the same scripts — avoiding an ongoing sync step entirely.

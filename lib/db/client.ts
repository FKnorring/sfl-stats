import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

// Single source of truth for which database (local file or hosted Turso)
// every connection in this app talks to. Selected by DATABASE_URL:
//   - unset, or "file:data/sfl.db" → local SQLite file (dev/test default)
//   - "libsql://<db>.turso.io"     → hosted Turso, needs DATABASE_AUTH_TOKEN
// See docs/adr/0003-hosted-db-turso-libsql-drizzle.md.
const DEFAULT_LOCAL_URL = "file:data/sfl.db"

function resolveUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_LOCAL_URL
}

function makeClient() {
  return createClient({
    url: resolveUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
}

// Read/write Drizzle instance. CLI scripts (scrape-roster, ingest-demos,
// faceit-sync) are the only callers that should import this — the app
// (app/, lib/db.ts, lib/faceit.ts) must stay read-only (see
// docs/adr/0002-public-app-is-read-only.md) and should import `db` below
// instead.
export function openWritableDb() {
  return drizzle(makeClient(), { schema })
}

// Shared type for the writable Drizzle instance, used to annotate helper
// functions in scripts/ that take `db` as a parameter.
export type AppDb = ReturnType<typeof openWritableDb>

// Read-only-by-convention Drizzle instance used by the app. There's no
// driver-level readonly flag with libSQL (unlike better-sqlite3's
// `readonly: true`) — this connection is only as read-only as the code
// that uses it, backed by a read-only-scoped Turso auth token in the
// deployed environment.
export const db = drizzle(makeClient(), { schema })

import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { DB_PATH } from "@/lib/db-path"

// Writable connection used only by CLI scripts (scrape-roster, ingest-demos).
// The Next.js app never imports this — it only ever opens a read-only
// connection via lib/db.ts, so the web server never writes to the DB file.
export function openWritableDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  const schema = fs.readFileSync(
    path.join(process.cwd(), "lib", "schema.sql"),
    "utf-8"
  )
  db.exec(schema)
  return db
}

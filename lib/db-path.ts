import path from "node:path"

// Single source of truth for where the SQLite file lives, shared by the
// writable CLI scripts and the read-only app connection.
export const DB_PATH = path.join(process.cwd(), "data", "sfl.db")

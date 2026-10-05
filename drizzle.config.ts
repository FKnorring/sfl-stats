import { defineConfig } from "drizzle-kit"

// DATABASE_URL/DATABASE_AUTH_TOKEN select local file vs. hosted Turso, same
// as lib/db/client.ts — see docs/adr/0003-hosted-db-turso-libsql-drizzle.md.
export default defineConfig({
  dialect: "turso",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:data/sfl.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
})

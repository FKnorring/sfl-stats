import assert from "node:assert/strict"
import { test } from "node:test"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

test("generation retirement upgrades an existing DB without touching league data", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "sfl-cache-migration-"))
  const client = createClient({ url: "file::memory:" })
  try {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8")
    )
    const retirementIndex = journal.entries.findIndex(
      (entry: { tag: string }) => entry.tag === "0010_retire_cache_generation"
    )
    assert.notEqual(retirementIndex, -1)
    // hold back the retirement and every later migration
    journal.entries.splice(retirementIndex)
    await mkdir(path.join(folder, "meta"))
    await writeFile(
      path.join(folder, "meta", "_journal.json"),
      JSON.stringify(journal)
    )
    for (const entry of journal.entries)
      await copyFile(
        path.join("drizzle", `${entry.tag}.sql`),
        path.join(folder, `${entry.tag}.sql`)
      )
    await migrate(drizzle(client), { migrationsFolder: folder })
    assert.equal(
      (await client.execute("SELECT generation FROM cache_generation")).rows
        .length,
      1
    )
    await client.execute(
      "INSERT INTO teams (id, name, season, division) VALUES (1, 'Fixture', 'SFL Säsong 9', 'Division 1')"
    )
    await migrate(drizzle(client), { migrationsFolder: "drizzle" })
    assert.deepEqual(
      (
        await client.execute(
          "SELECT name FROM sqlite_master WHERE name='cache_generation'"
        )
      ).rows,
      []
    )
    assert.equal(
      (await client.execute("SELECT name FROM teams WHERE id=1")).rows[0].name,
      "Fixture"
    )
    await migrate(drizzle(client), { migrationsFolder: "drizzle" })
  } finally {
    client.close()
    await rm(folder, { recursive: true, force: true })
  }
})

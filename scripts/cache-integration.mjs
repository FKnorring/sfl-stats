import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import os from "node:os"
import { setTimeout as sleep } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { persistRatingExtraction } from "../lib/rating-db.ts"

const baseline = process.argv.includes("--baseline")
const outputIndex = process.argv.indexOf("--output")
const browserIndex = process.argv.indexOf("--browser")
assert.equal(
  typeof globalThis.gc,
  "function",
  "Run with pnpm test:cache (requires --expose-gc for native SQLite cleanup)"
)
const fixtureFolder = await mkdtemp(path.join(os.tmpdir(), "sfl-cache-data-"))
const fixtureDatabaseUrl = pathToFileURL(
  path.join(fixtureFolder, "fixture.db")
).href
const database = createClient({ url: fixtureDatabaseUrl })
await migrate(drizzle(database), { migrationsFolder: "drizzle" })
const now = new Date().toISOString()
const steamid = (id) => String(76561198000000000n + BigInt(id))
const counters = { db: 0, steam: 0, toornament: 0 }
let largestQueryResultBytes = 0
let steamFailure = false
let scheduleFailure = false
let heldRead = null

const seed = []
for (let team = 1; team <= 12; team++) {
  const name = team === 1 ? "Alpha" : team === 2 ? "Beta" : `Team ${team}`
  seed.push({
    sql: "INSERT INTO teams (id,name,season,division) VALUES (?,?,?,?)",
    args: [
      team,
      name,
      "SFL Säsong 9",
      team === 12 ? "Division 2" : "Division 1",
    ],
  })
  for (let offset = 0; offset < 5; offset++) {
    const id = (team - 1) * 5 + offset + 1
    seed.push(
      {
        sql: "INSERT INTO players VALUES (?,?,?,?)",
        args: [steamid(id), `Player ${id}`, now, now],
      },
      {
        sql: "INSERT INTO roster_entries (team_id,nickname,matched_steamid64,match_status,scraped_at) VALUES (?,?,?,'auto_high',?)",
        args: [team, `Player ${id}`, steamid(id), now],
      },
      {
        sql: "INSERT INTO faceit_players VALUES (?,?,?,?,?,?)",
        args: [steamid(id), `faceit-${id}`, `Faceit ${id}`, 2000, 8, now],
      }
    )
  }
}
for (let match = 1; match <= 200; match++) {
  const teamA = ((match - 1) % 6) * 2 + 1
  const teamB = teamA + 1
  seed.push({
    sql: "INSERT INTO matches (id,file_name,map_name,demo_date,team_a_id,team_b_id,team_a_score,team_b_score,total_rounds,parsed_at) VALUES (?,?,?, ?,?,?,13,7,20,?)",
    args: [match, `${match}.dem`, "de_nuke", now, teamA, teamB, now],
  })
  for (let offset = 0; offset < 10; offset++) {
    const id = (teamA - 1) * 5 + offset + 1
    seed.push({
      sql: "INSERT INTO player_match_stats (match_id,steamid64,team_name,kills,deaths,assists,headshot_kills,damage_total,adr,hs_pct) VALUES (?,?,?,20,15,4,10,1600,80,50)",
      args: [match, steamid(id), offset < 5 ? "CT" : "T"],
    })
  }
}
seed.push({
  sql: "INSERT INTO toornament_matches (toornament_match_id,scheduled_at,team_a_name_raw,team_b_name_raw,team_a_id,team_b_id,status,scraped_at) VALUES ('official',?,'Alpha','Beta',1,2,'pending',?)",
  args: [now, now],
})
for (let i = 0; i < seed.length; i += 1000)
  await database.batch(seed.slice(i, i + 1000), "write")
await database.execute(`
  WITH RECURSIVE ticks(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM ticks WHERE n<299)
  INSERT INTO match_kills
    (match_id,round,tick,attacker_steamid64,victim_steamid64,
      attacker_x,attacker_y,victim_x,victim_y,attacker_side,victim_side,weapon,headshot)
  SELECT m.id,1,t.n,
    CAST(76561198000000000 + (m.team_a_id-1)*5 + t.n%5+1 AS TEXT),
    CAST(76561198000000000 + (m.team_b_id-1)*5 + t.n%5+1 AS TEXT),
    0,0,10,10,'CT','T','ak47',1 FROM matches m CROSS JOIN ticks t
`)
const ratingRounds = Array.from({ length: 20 }, (_, ordinal) => ({
  ordinal,
  rawRound: ordinal,
  startTick: ordinal * 1000,
  freezeTick: ordinal * 1000 + 10,
  endTick: ordinal * 1000 + 900,
  winner: ordinal < 13 ? 3 : 2,
}))
await persistRatingExtraction(drizzle(database), 1, {
  rounds: ratingRounds,
  facts: ratingRounds.flatMap((round) =>
    Array.from({ length: 10 }, (_, index) => {
      const side = index < 5 ? 3 : 2
      const won = side === round.winner
      return {
        ordinal: round.ordinal,
        steamid64: steamid(index + 1),
        name: `Player ${index + 1}`,
        side,
        kills: Number(won),
        weightedKills: Number(won),
        ecoKills: 0,
        deaths: Number(!won),
        assists: 0,
        flashAssists: 0,
        headshotKills: Number(won),
        damage: won ? 100 : 0,
        utilityDamage: 0,
        survived: won,
        traded: false,
        openingKills: won && index % 5 === 0 ? 1 : 0,
        openingDeaths: !won && index % 5 === 0 ? 1 : 0,
        clutchWins: 0,
        clutchOpponents: 0,
        equipmentValue: 3000,
      }
    })
  ),
  unavailableReason: null,
})
console.log("Isolated fixture: 12 teams, 60 players, 200 demos, 60,000 kills")

function decode(value) {
  if (value.type === "null") return null
  if (value.type === "integer") return BigInt(value.value)
  if (value.type === "blob") return Buffer.from(value.base64, "base64")
  return value.value
}
function encode(value) {
  if (value === null) return { type: "null" }
  if (typeof value === "bigint")
    return { type: "integer", value: String(value) }
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value }
  if (typeof value === "string") return { type: "text", value }
  return { type: "blob", base64: Buffer.from(value).toString("base64") }
}
const stage = "/tournaments/123/stages/456/"
const page = `RootComponent, ${JSON.stringify({
  pageContent: {
    fields: {
      contentArea: [
        {
          system: { contentType: "contentBoxItem" },
          fields: {
            itemTitle: "SFL Säsong 9",
            itemContent: [
              {
                system: { contentType: "contentBoxItem" },
                fields: {
                  itemTitle: "Counter-Strike 2",
                  itemContent: [
                    {
                      system: { contentType: "headlineBlock" },
                      fields: { headline: "Division 1" },
                    },
                    {
                      system: { contentType: "toornamentEmbedBlock" },
                      fields: { embedPath: stage },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
})}`
const labels = [
  "Played",
  "Wins",
  "Draws",
  "Losses",
  "Forfeits",
  "Score For",
  "Score Against",
  "Score Difference",
  "Points",
]
const ranking = `<div class="ranking format-sheet"><div class="ranking-title">${labels.map((label) => `<div class="metric"><abbr title="${label}"></abbr></div>`).join("")}</div><div class="ranking-item"><div class="rank">1</div><div class="name">Alpha</div>${[2, 2, 0, 0, 0, 26, 14, 12, 6].map((value) => `<div class="metric">${value}</div>`).join("")}</div></div>`
const schedule = `<div data-role="sch-event" data-time="${now}"><div class="match" data-type="match" data-id="upcoming"><div class="opponent"><div class="name">Alpha</div></div><div class="opponent"><div class="name">Beta</div></div></div><div class="match" data-type="match" data-id="completed"><div class="opponent"><div class="name win">Alpha</div><div class="result">13</div></div><div class="opponent"><div class="name loss">Beta</div><div class="result">7</div></div></div></div>`

const fixture = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    if (url.pathname === "/upstream") {
      // Deterministic simulated network latency, not a production measurement.
      await sleep(40)
      if (url.searchParams.get("host") === "api.steampowered.com") {
        counters.steam++
        if (steamFailure) {
          response.writeHead(503).end("Steam fixture failure")
          return
        }
        response.setHeader("Content-Type", "application/json")
        response.end(
          JSON.stringify({
            response: {
              players: url.searchParams
                .get("ids")
                .split(",")
                .map((steamid) => ({
                  steamid,
                  personaname: "Steam fixture",
                  avatarfull: "https://example.invalid/avatar.png",
                })),
            },
          })
        )
      } else {
        counters.toornament++
        if (scheduleFailure) {
          response.writeHead(503).end("Toornament fixture failure")
          return
        }
        response.end(
          url.searchParams.get("host") === "publiclir.se"
            ? page
            : url.searchParams.get("path").includes("/stages/")
              ? ranking
              : schedule
        )
      }
      return
    }
    let body = ""
    for await (const chunk of request) body += chunk
    const pipeline = JSON.parse(body)
    await sleep(40)
    const results = []
    for (const operation of pipeline.requests) {
      if (operation.type === "close") {
        results.push({ type: "ok", response: { type: "close" } })
        continue
      }
      assert.equal(operation.type, "execute")
      assert.ok(!operation.stmt.sql.includes("cache_generation"))
      if (/^\s*(SELECT|WITH)\b/i.test(operation.stmt.sql)) counters.db++
      const result = await database.execute({
        sql: operation.stmt.sql,
        args: operation.stmt.args.map(decode),
      })
      largestQueryResultBytes = Math.max(
        largestQueryResultBytes,
        Buffer.byteLength(JSON.stringify(result.rows))
      )
      if (
        heldRead &&
        operation.stmt.sql.includes("WHERE p.steamid64") &&
        operation.stmt.args.some((arg) => decode(arg) === steamid(62))
      ) {
        const pending = heldRead
        heldRead = null
        pending.entered()
        await pending.wait
      }
      results.push({
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: result.columns.map((name, i) => ({
              name,
              decltype: result.columnTypes[i] || null,
            })),
            rows: result.rows.map((row) =>
              result.columns.map((_, i) => encode(row[i]))
            ),
            affected_row_count: result.rowsAffected,
            last_insert_rowid: result.lastInsertRowid
              ? String(result.lastInsertRowid)
              : null,
          },
        },
      })
    }
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ baton: null, base_url: null, results }))
  } catch (error) {
    console.error(error)
    response.writeHead(500).end(String(error))
  }
})
fixture.listen(0, "127.0.0.1")
await once(fixture, "listening")
const upstream = `http://127.0.0.1:${fixture.address().port}`
const portProbe = http.createServer()
portProbe.listen(0, "127.0.0.1")
await once(portProbe, "listening")
const port = portProbe.address().port
await new Promise((resolve) => portProbe.close(resolve))
const secret = "cache-integration-fixture-only"
const namespace = `sfl-stats-test-${randomUUID()}`
const buildDirectory = await mkdtemp(
  path.join(process.cwd(), ".next-cache-test-")
)
const nextEnv = await readFile("next-env.d.ts", "utf8")
const tsconfig = await readFile("tsconfig.json", "utf8")
const serverEnv = {
  ...process.env,
  DATABASE_URL: upstream,
  DATABASE_AUTH_TOKEN: "",
  STEAM_API_KEY: "fixture-only",
  CACHE_TEST_UPSTREAM: upstream,
  CACHE_NAMESPACE: namespace,
  CACHE_REVALIDATION_SECRET: secret,
  ENV: "prod",
  CACHE_TEST_BUILD_DIR: path.relative(process.cwd(), buildDirectory),
}
function runNext(args, env = serverEnv) {
  const process = spawn(
    globalThis.process.execPath,
    [
      "--import",
      pathToFileURL(path.resolve("scripts/cache-upstream-fixture.mjs")).href,
      path.resolve("node_modules/next/dist/bin/next"),
      ...args,
    ],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  process.stdout.on("data", (chunk) => {
    logs += chunk
  })
  process.stderr.on("data", (chunk) => {
    logs += chunk
  })
  return process
}
let child
let logs = ""
const origin = `http://127.0.0.1:${port}`
async function retryNotification(source) {
  const notifier = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.resolve("scripts/revalidate-cache.ts"),
      "--source",
      source,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: upstream,
        DATABASE_AUTH_TOKEN: "",
        CACHE_NAMESPACE: namespace,
        CACHE_REVALIDATION_URL: `${origin}/api/revalidate`,
        CACHE_REVALIDATION_SECRET: secret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  let output = ""
  notifier.stdout.on("data", (chunk) => {
    output += chunk
  })
  notifier.stderr.on("data", (chunk) => {
    output += chunk
  })
  const [code] = await once(notifier, "exit")
  assert.equal(code, 0, output)
  await sleep(350)
}
const routes = [
  "/",
  "/leaderboard",
  "/teams",
  "/teams/Division%201",
  "/teams/Division%202",
  "/teams?division=Division%201&season=SFL+S%C3%A4song+9",
  "/teams/Alpha",
  "/teams/compare?teamA=1&teamB=2",
  `/players/${steamid(1)}`,
  "/teams/team/Alpha",
  "/follow/Alpha",
  "/matches",
  "/matches/demo/1",
  "/matches/demo/2",
  "/matches/official",
  `/api/players/${steamid(1)}/card`,
  "/leaderboard?stat=adr&team=Alpha",
  "/leaderboard?stat=rating",
  "/players/missing",
  "/teams/missing",
]
const report = { mode: baseline ? "baseline" : "cache-components", routes: [] }
function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}
async function load(route, timeout = 20000) {
  const start = performance.now()
  const response = await fetch(`${origin}${route}`, {
    signal: AbortSignal.timeout(timeout),
  })
  const ttfb = performance.now() - start
  const text = await response.text()
  assert.ok(
    !/NEXT_PRERENDER_INTERRUPTED|data-next-error|\\?"digest\\?":\\?"[0-9]+/.test(
      text
    ),
    `${route}: streamed rendering failed: ${logs}`
  )
  return {
    status: response.status,
    ttfb,
    total: performance.now() - start,
    text,
  }
}
async function eventually(route, predicate) {
  const deadline = performance.now() + 15000
  let sample
  do {
    sample = await load(route)
    if (predicate(sample)) return sample
    await sleep(100)
  } while (performance.now() < deadline)
  assert.fail(`${route}: did not converge after revalidation; ${logs}`)
}
async function waitUntilReady(route) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `Server exited: ${logs}`)
    try {
      return await load(route, 60000)
    } catch (error) {
      if (!(error instanceof TypeError) || error.cause?.code !== "ECONNREFUSED")
        throw error
      await sleep(200)
    }
  }
  assert.fail(`Server did not start: ${logs}`)
}
try {
  console.log("Building Cache Components against the isolated fixture")
  child = runNext(["build"])
  const [buildCode] = await once(child, "exit")
  assert.equal(buildCode, 0, logs)
  console.log(logs)
  const prerenders = JSON.parse(
    await readFile(path.join(buildDirectory, "prerender-manifest.json"), "utf8")
  )
  for (const route of [
    "/teams/Division%201",
    "/teams/Division%202",
    "/teams/team/Alpha",
    "/follow/Alpha",
    `/players/${steamid(1)}`,
    "/matches/official",
    "/matches/demo/1",
  ]) {
    const prerender = prerenders.routes[decodeURIComponent(route)]
    assert.ok(prerender, `${route}: must be prerendered`)
    assert.equal(
      prerender.initialRevalidateSeconds,
      21600,
      `${route}: must retain six-hour ISR`
    )
  }
  logs = ""
  child = runNext(["start", "-p", String(port)])
  await waitUntilReady("/api/players/missing/card")
  for (const route of routes) {
    console.log(`Measuring ${route}`)
    const cold = await load(route)
    if (route === "/players/missing" || route === "/teams/missing") {
      assert.ok(
        cold.status === 404 ||
          cold.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
        "Missing pages must retain the native not-found response"
      )
    } else assert.equal(cold.status, 200, logs)
    if (route === "/")
      assert.ok(
        cold.text.includes("13-7"),
        "Home must retain completed results"
      )
    if (route === "/leaderboard")
      assert.ok(
        cold.text.includes(steamid(1)),
        "Fixture demos must qualify for the leaderboard"
      )
    if (route.startsWith("/teams?"))
      assert.ok(
        cold.text.includes("Alpha"),
        "Legacy division links must render standings"
      )
    if (route === "/teams/Division%202") {
      assert.ok(
        cold.text.includes("Team 12"),
        "Division route must render its teams"
      )
      assert.ok(
        !cold.text.includes('href="/teams/team/Alpha"'),
        "Other divisions must not render team links"
      )
    }
    if (route === "/matches/demo/1")
      assert.ok(
        cold.text.replaceAll('\\"', '"').includes('"damage":1300'),
        "Demo rating details must round-trip through the shared cache"
      )
    const before = { ...counters }
    const warm = []
    for (let i = 0; i < 5; i++) {
      const sample = await load(route)
      assert.equal(sample.status, cold.status, `${route}: ${logs}`)
      warm.push(sample)
    }
    const calls = Object.fromEntries(
      Object.keys(counters).map((key) => [key, counters[key] - before[key]])
    )
    report.routes.push({
      route,
      coldMs: Math.round(cold.ttfb),
      warmMedianMs: Math.round(median(warm.map((sample) => sample.ttfb))),
      bytes: Buffer.byteLength(cold.text),
      warmCalls: calls,
    })
    if (!baseline)
      assert.deepEqual(calls, { db: 0, steam: 0, toornament: 0 }, route)
  }
  if (browserIndex !== -1) {
    const executable = process.argv[browserIndex + 1]
    assert.ok(executable, "--browser requires an installed Chromium executable")
    const { checkCacheNavigation } = await import("./cache-browser-fixture.mjs")
    console.log(
      "Checking browser navigation, URL filters and follows hydration"
    )
    await checkCacheNavigation(executable, origin)
    report.browser = "passed"
  }
  if (!baseline) {
    const endpoint = `${origin}/api/revalidate`
    const notify = async (body, token = secret) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      await response.text()
      if (response.ok) await sleep(350)
      return response
    }
    assert.equal((await notify({ source: "demos" }, "wrong")).status, 401)
    assert.equal((await notify({ source: "unknown" })).status, 400)
    assert.equal((await fetch(endpoint)).status, 405)
    const { cacheScope } = await import("../lib/cache-policy.ts")
    const target = cacheScope(upstream, namespace)
    await database.execute({
      sql: "UPDATE players SET latest_ingame_name='Updated fixture' WHERE steamid64=?",
      args: [steamid(1)],
    })
    await database.execute({
      sql: "UPDATE roster_entries SET nickname='Updated fixture' WHERE matched_steamid64=?",
      args: [steamid(1)],
    })
    await database.execute({
      sql: "UPDATE player_match_round_stats SET damage=damage+25 WHERE match_id=1 AND steamid64=?",
      args: [steamid(1)],
    })
    await database.execute(
      "UPDATE teams SET logo_url='https://example.invalid/new-logo.png' WHERE id=1"
    )
    assert.equal(
      (await notify({ source: "demos", scope: "wrong" })).status,
      409
    )
    await retryNotification("demos")
    const after = await eventually(
      `/api/players/${steamid(1)}/card`,
      (sample) => JSON.parse(sample.text).inGameName === "Updated fixture"
    )
    assert.equal(JSON.parse(after.text).inGameName, "Updated fixture")
    for (const route of [
      "/",
      "/leaderboard",
      "/teams/team/Alpha",
      "/matches/demo/1",
    ]) {
      const fresh = await eventually(
        route,
        (sample) =>
          sample.text.includes("Updated fixture") &&
          sample.text.includes("new-logo.png") &&
          (route !== "/matches/demo/1" ||
            sample.text.replaceAll('\\"', '"').includes('"damage":1800'))
      )
      assert.equal(fresh.status, 200, `${route}: ${logs}`)
      assert.ok(
        fresh.text.includes("Updated fixture"),
        `${route}: updated player must be visible after invalidation; ${logs}`
      )
      assert.ok(fresh.text.includes("new-logo.png"), route)
      if (route === "/matches/demo/1")
        assert.ok(
          fresh.text.replaceAll('\\"', '"').includes('"damage":1800'),
          "Ingestion must invalidate cached rating explanations too"
        )
    }
    await load("/matches")
    const before = { ...counters }
    await retryNotification("schedule")
    await eventually("/matches", () => counters.toornament > before.toornament)
    assert.ok(counters.toornament > before.toornament)
    const card = await fetch(`${origin}/api/players/${steamid(1)}/card`)
    assert.equal(card.headers.get("cache-control"), "no-store")
    assert.equal((await card.json()).faceit.elo, 2000)
    await database.execute({
      sql: "INSERT INTO players VALUES (?, 'Recovery fixture', ?, ?)",
      args: [steamid(61), now, now],
    })
    steamFailure = true
    const failedCard = await load(`/api/players/${steamid(61)}/card`)
    assert.equal(JSON.parse(failedCard.text).avatarUrl, null)
    steamFailure = false
    const recoveredCard = await load(`/api/players/${steamid(61)}/card`)
    assert.equal(
      JSON.parse(recoveredCard.text).avatarUrl,
      "https://example.invalid/avatar.png"
    )
    await notify({ source: "schedule", scope: target })
    scheduleFailure = true
    await load("/matches")
    await sleep(200)
    const failedCalls = counters.toornament
    scheduleFailure = false
    await eventually("/matches", () => counters.toornament > failedCalls)
    assert.ok(
      counters.toornament > failedCalls,
      "Schedule failures must not be pinned"
    )
    await database.execute({
      sql: "INSERT INTO players VALUES (?, 'Race old', ?, ?)",
      args: [steamid(62), now, now],
    })
    let release
    const wait = new Promise((resolve) => {
      release = resolve
    })
    const entered = new Promise((resolve) => {
      heldRead = { entered: resolve, wait }
    })
    const inFlight = load(`/api/players/${steamid(62)}/card`)
    await Promise.race([
      entered,
      sleep(10000, undefined, { ref: false }).then(() => {
        throw new Error("The cache-fill race did not reach the held query")
      }),
    ])
    await database.execute({
      sql: "UPDATE players SET latest_ingame_name='Race fresh' WHERE steamid64=?",
      args: [steamid(62)],
    })
    await retryNotification("demos")
    release()
    await inFlight
    const afterRace = await eventually(
      `/api/players/${steamid(62)}/card`,
      (sample) => JSON.parse(sample.text).inGameName === "Race fresh"
    )
    assert.equal(
      JSON.parse(afterRace.text).inGameName,
      "Race fresh",
      "Native revalidation must eventually converge after a late cache fill"
    )
    const missing = await fetch(`${origin}/api/players/${steamid(63)}/card`)
    assert.equal(missing.status, 404)
    assert.equal(missing.headers.get("cache-control"), "no-store")
    await missing.text()
    await database.execute({
      sql: "INSERT INTO players VALUES (?, 'Newly ingested fixture', ?, ?)",
      args: [steamid(63), now, now],
    })
    await database.execute(
      "UPDATE teams SET name='Netlight fixture' WHERE id=3"
    )
    await retryNotification("roster")
    await eventually(
      `/api/players/${steamid(63)}/card`,
      (sample) => sample.status === 200
    )
    const hiddenPlayer = await eventually(`/players/${steamid(11)}`, (sample) =>
      sample.text.includes("Netlight fixture")
    )
    assert.ok(
      !hiddenPlayer.text.includes("attackerX"),
      "Public player page must not serialize hidden heatmap data"
    )
    const hiddenDemo = (
      await eventually("/matches/demo/2", (sample) =>
        sample.text.includes("Netlight fixture")
      )
    ).text.replaceAll('\\"', '"')
    assert.ok(
      hiddenDemo.includes('"attackerX":null'),
      "Hidden demo positions must be redacted after cache reads"
    )
    assert.ok(
      !hiddenDemo.includes('"attackerX":0'),
      "Hidden attacker positions must not reach the browser"
    )
    assert.ok(
      hiddenDemo.includes('"victimX":10'),
      "Other team's public positions must be preserved"
    )
    assert.ok(
      largestQueryResultBytes < 1800000,
      "Query payloads need headroom below the 2 MB provider limit"
    )
    report.largestQueryResultBytes = largestQueryResultBytes
    report.storage =
      "local in-memory handler; Vercel sharing requires preview validation"
    report.invalidation = "passed"
  }
  assert.ok(!/items over 2MB|Failed to set Next.js data cache/.test(logs), logs)

  console.log(
    "Checking local-only Server Action and partial-write invalidation"
  )
  child.kill()
  await once(child, "exit")
  logs = ""
  const overridesPath = path.join(fixtureFolder, "overrides.json")
  child = runNext(["dev", "-p", String(port)], {
    ...serverEnv,
    ENV: "local",
    DATABASE_URL: fixtureDatabaseUrl,
    CACHE_REVALIDATION_URL: "",
    CACHE_REVALIDATION_SECRET: "",
    CACHE_TEST_OVERRIDES_PATH: overridesPath,
  })
  const adminPage = await waitUntilReady("/admin")
  assert.equal(adminPage.status, 200, logs)
  assert.ok(adminPage.text.includes("Overwrite a roster"), logs)
  const actions = JSON.parse(
    await readFile(
      path.join(
        buildDirectory,
        "dev",
        "server",
        "server-reference-manifest.json"
      ),
      "utf8"
    )
  )
  const actionId = Object.entries(actions.node).find(
    ([, entry]) => entry.exportedName === "overrideSteamId"
  )?.[0]
  assert.ok(actionId, "Local admin Server Action must be registered")
  const save = async (steamid64) => {
    const response = await fetch(`${origin}/admin`, {
      method: "POST",
      headers: {
        "Next-Action": actionId,
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: origin,
      },
      body: JSON.stringify([1, steamid64]),
      signal: AbortSignal.timeout(30000),
    })
    return { status: response.status, text: await response.text() }
  }
  assert.equal((await load(`/api/players/${steamid(64)}/card`)).status, 404)
  const saved = await save(steamid(64))
  assert.equal(saved.status, 200, `${saved.text}: ${logs}`)
  assert.ok(saved.text.includes('"ok":true'), saved.text)
  assert.equal(
    (await load(`/api/players/${steamid(64)}/card`)).status,
    200,
    "updateTag must immediately expire a cached missing player after the action"
  )
  assert.equal(
    JSON.parse(await readFile(overridesPath, "utf8"))[steamid(64)]
      .rosterEntryId,
    1
  )
  assert.equal((await load(`/api/players/${steamid(65)}/card`)).status, 404)
  await writeFile(`${overridesPath}.fail`, "")
  const partial = await save(steamid(65))
  assert.equal(partial.status, 500, partial.text)
  assert.equal(
    (
      await database.execute(
        "SELECT matched_steamid64 FROM roster_entries WHERE id=1"
      )
    ).rows[0].matched_steamid64,
    steamid(65)
  )
  assert.equal(
    (await load(`/api/players/${steamid(65)}/card`)).status,
    200,
    "Committed data must be invalidated even when override-file persistence fails"
  )
  report.localAdmin = "passed"
  console.log(JSON.stringify(report, null, 2))
  if (outputIndex !== -1)
    await writeFile(
      process.argv[outputIndex + 1],
      JSON.stringify(report, null, 2)
    )
} finally {
  if (child?.exitCode === null) {
    child.kill()
    await once(child, "exit")
  }
  fixture.closeAllConnections()
  await new Promise((resolve) => fixture.close(resolve))
  database.close()
  await writeFile("next-env.d.ts", nextEnv)
  await writeFile("tsconfig.json", tsconfig)
  // Native statement handles can outlive client.close() until garbage collection.
  globalThis.gc()
  await rm(fixtureFolder, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
  await rm(buildDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}

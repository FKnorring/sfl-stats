import { sql } from "drizzle-orm"

import { openWritableDb, type AppDb } from "@/lib/db/client"
import {
  getPlayerBySteamId,
  getPlayerHistory,
  getMatchStats,
  getPlayerStatsLifetime,
  parseNumericStat,
  type FaceitMatchStats,
} from "@/lib/faceit-client"

const DEFAULT_DAYS = 7
const DEFAULT_MAX_AGE_HOURS = 12

type Args = {
  probe: string | null
  days: number
  force: boolean
  maxAgeHours: number
  steamid: string | null
}

function parseArgs(argv: string[]): Args {
  function flag(name: string): string | null {
    const idx = argv.indexOf(name)
    return idx !== -1 ? (argv[idx + 1] ?? null) : null
  }
  return {
    probe: flag("--probe"),
    days: Number(flag("--days") ?? DEFAULT_DAYS),
    force: argv.includes("--force"),
    maxAgeHours: Number(flag("--max-age-hours") ?? DEFAULT_MAX_AGE_HOURS),
    steamid: flag("--steamid"),
  }
}

/**
 * Dumps raw Faceit responses for one player so we can confirm real field
 * names (K/D, ADR, per-match elo) before trusting the parsing logic below.
 * No DB writes. Run this first once a real FACEIT_API_KEY is set.
 */
async function probe(steamid64: string) {
  console.log(`[faceit-sync] probing steamid64=${steamid64}`)

  const player = await getPlayerBySteamId(steamid64)
  console.log("--- player ---")
  console.log(JSON.stringify(player, null, 2))
  if (!player) {
    console.log("[faceit-sync] not found on Faceit, stopping probe")
    return
  }

  const lifetime = await getPlayerStatsLifetime(player.playerId)
  console.log("--- lifetime stats ---")
  console.log(JSON.stringify(lifetime, null, 2))

  const nowSec = Math.floor(Date.now() / 1000)
  const history = await getPlayerHistory(player.playerId, {
    from: nowSec - 30 * 24 * 60 * 60,
    to: nowSec,
    limit: 5,
  })
  console.log("--- history (last 30 days, up to 5) ---")
  console.log(JSON.stringify(history, null, 2))

  if (history.length > 0) {
    const matchStats = await getMatchStats(history[0].match_id)
    console.log("--- match stats for most recent match ---")
    console.log(JSON.stringify(matchStats, null, 2))
  }
}

type ConfirmedPlayer = { steamid64: string }

/**
 * "Confirmed" steamid reuses the existing resolution convention from
 * lib/db.ts / app/leaderboard: match_status manual or auto_high.
 */
async function getConfirmedPlayers(db: AppDb): Promise<ConfirmedPlayer[]> {
  return (await db.all(
    sql`SELECT DISTINCT p.steamid64 AS steamid64
        FROM players p
        JOIN roster_entries re ON re.matched_steamid64 = p.steamid64
        WHERE re.match_status IN ('manual', 'auto_high')`
  )) as ConfirmedPlayer[]
}

async function getFreshSteamids(
  db: AppDb,
  maxAgeHours: number
): Promise<Set<string>> {
  const cutoff = new Date(
    Date.now() - maxAgeHours * 60 * 60 * 1000
  ).toISOString()
  const rows = (await db.all(
    sql`SELECT steamid64 FROM faceit_players WHERE last_synced_at >= ${cutoff}`
  )) as { steamid64: string }[]
  return new Set(rows.map((r) => r.steamid64))
}

async function upsertFaceitPlayer(
  db: AppDb,
  steamid64: string,
  player: {
    playerId: string
    nickname: string
    elo: number | null
    skillLevel: number | null
  },
  now: string
) {
  await db.run(sql`
    INSERT INTO faceit_players (steamid64, faceit_player_id, nickname, elo, skill_level, last_synced_at)
    VALUES (${steamid64}, ${player.playerId}, ${player.nickname}, ${player.elo}, ${player.skillLevel}, ${now})
    ON CONFLICT(steamid64) DO UPDATE SET
      faceit_player_id = excluded.faceit_player_id,
      nickname = excluded.nickname,
      elo = excluded.elo,
      skill_level = excluded.skill_level,
      last_synced_at = excluded.last_synced_at
  `)
}

async function getExistingMatchIds(
  db: AppDb,
  steamid64: string
): Promise<Set<string>> {
  const rows = (await db.all(
    sql`SELECT faceit_match_id FROM faceit_match_stats WHERE steamid64 = ${steamid64}`
  )) as { faceit_match_id: string }[]
  return new Set(rows.map((r) => r.faceit_match_id))
}

/**
 * Finds this player's stat row within a match-stats response. Faceit keys
 * player_stats by faceit player_id, nested under rounds[].teams[].players[].
 */
function findPlayerStats(
  matchStats: FaceitMatchStats,
  faceitPlayerId: string
): Record<string, unknown> | null {
  for (const round of matchStats.rounds) {
    for (const team of round.teams) {
      for (const p of team.players) {
        if (p.player_id === faceitPlayerId) return p.player_stats
      }
    }
  }
  return null
}

async function insertMatchStats(
  db: AppDb,
  steamid64: string,
  faceitMatchId: string,
  playedAt: string,
  stats: Record<string, unknown>,
  now: string
) {
  const kills = parseNumericStat(stats["Kills"])
  const deaths = parseNumericStat(stats["Deaths"])
  const assists = parseNumericStat(stats["Assists"])
  const kdRatio = parseNumericStat(stats["K/D Ratio"])
  const adr = parseNumericStat(stats["ADR"])
  const hsPct = parseNumericStat(stats["Headshots %"])

  await db.run(sql`
    INSERT INTO faceit_match_stats
      (steamid64, faceit_match_id, played_at, kills, deaths, assists, kd_ratio, adr, hs_pct, elo_at_match, fetched_at)
    VALUES
      (${steamid64}, ${faceitMatchId}, ${playedAt}, ${kills}, ${deaths}, ${assists}, ${kdRatio}, ${adr}, ${hsPct}, NULL, ${now})
    ON CONFLICT(steamid64, faceit_match_id) DO NOTHING
  `)
}

type Summary = {
  synced: number
  skippedFresh: number
  notFound: number
  failed: number
  newMatchRows: number
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function syncPlayer(
  db: AppDb,
  steamid64: string,
  days: number,
  summary: Summary
) {
  const now = new Date().toISOString()

  const player = await getPlayerBySteamId(steamid64)
  if (!player) {
    console.log(`[faceit-sync] not found on Faceit: ${steamid64}`)
    summary.notFound++
    return
  }

  await upsertFaceitPlayer(db, steamid64, player, now)

  const nowSec = Math.floor(Date.now() / 1000)
  const history = await getPlayerHistory(player.playerId, {
    from: nowSec - days * 24 * 60 * 60,
    to: nowSec,
  })

  const existing = await getExistingMatchIds(db, steamid64)
  const newItems = history.filter((item) => !existing.has(item.match_id))

  for (const item of newItems) {
    const matchStats = await getMatchStats(item.match_id)
    if (!matchStats) continue
    const playerStats = findPlayerStats(matchStats, player.playerId)
    if (!playerStats) {
      console.warn(
        `[faceit-sync] player ${player.playerId} not found in match stats for ${item.match_id}`
      )
      continue
    }
    const playedAtMs = item.finished_at ?? item.started_at
    const playedAt = playedAtMs
      ? new Date(playedAtMs * 1000).toISOString()
      : now
    await insertMatchStats(
      db,
      steamid64,
      item.match_id,
      playedAt,
      playerStats,
      now
    )
    summary.newMatchRows++
    await sleep(200)
  }

  summary.synced++
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.probe) {
    await probe(args.probe)
    return
  }

  const db = openWritableDb()
  let targets = args.steamid
    ? [{ steamid64: args.steamid }]
    : await getConfirmedPlayers(db)
  console.log(`[faceit-sync] ${targets.length} confirmed player(s) found`)

  const summary: Summary = {
    synced: 0,
    skippedFresh: 0,
    notFound: 0,
    failed: 0,
    newMatchRows: 0,
  }

  if (!args.force && !args.steamid) {
    const fresh = await getFreshSteamids(db, args.maxAgeHours)
    const before = targets.length
    targets = targets.filter((t) => !fresh.has(t.steamid64))
    summary.skippedFresh = before - targets.length
  }

  for (const { steamid64 } of targets) {
    console.log(`[faceit-sync] syncing ${steamid64}`)
    try {
      await syncPlayer(db, steamid64, args.days, summary)
    } catch (err) {
      console.error(`[faceit-sync] failed to sync ${steamid64}:`, err)
      summary.failed++
    }
    await sleep(200)
  }

  console.log(
    `[faceit-sync] done: synced ${summary.synced}, skipped (fresh) ${summary.skippedFresh}, ` +
      `not found ${summary.notFound}, failed ${summary.failed}, new match rows ${summary.newMatchRows}`
  )
}

main().catch((err) => {
  console.error("[faceit-sync] failed:", err)
  process.exit(1)
})

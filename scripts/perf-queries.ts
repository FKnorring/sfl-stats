// Times every read query the app uses against DATABASE_URL (read-only) and
// prints median latency and serialized payload size, so fetch-performance
// changes can be compared before/after. Usage: pnpm perf:queries [runs]
import { sql } from "drizzle-orm"
import { db } from "@/lib/db/client"
import * as q from "@/lib/db"
import * as faceit from "@/lib/faceit"

const runs = Number(process.argv[2] ?? 3)

async function time(name: string, fn: () => Promise<unknown>) {
  const ms: number[] = []
  let bytes = 0
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    const result = await fn()
    ms.push(performance.now() - start)
    bytes = JSON.stringify(
      result instanceof Map ? [...result.entries()] : result
    ).length
  }
  ms.sort((a, b) => a - b)
  console.log(
    `${name.padEnd(42)} ${ms[Math.floor(ms.length / 2)].toFixed(0).padStart(6)} ms ${(bytes / 1024).toFixed(1).padStart(8)} KB`
  )
}

const season = (await q.getCurrentSeason()) ?? undefined
const catalog = await q.getCurrentTeamCatalog()
const team = catalog[0]
const [{ steamid64 }] = await db.all<{ steamid64: string }>(
  sql`SELECT steamid64 FROM player_match_stats GROUP BY steamid64 ORDER BY COUNT(*) DESC LIMIT 1`
)
const [{ matchId }] = await db.all<{ matchId: number }>(
  sql`SELECT id AS matchId FROM matches ORDER BY demo_date DESC LIMIT 1`
)
console.log(
  `season=${season} team=${team.teamId} player=${steamid64} match=${matchId} runs=${runs}\n`
)

const cases: [string, () => Promise<unknown>][] = [
  ["getCurrentSeason", () => q.getCurrentSeason()],
  ["getCurrentTeamCatalog", () => q.getCurrentTeamCatalog()],
  ["getSeasons", () => q.getSeasons()],
  ["getDivisions", () => q.getDivisions()],
  ["getTeams", () => q.getTeams()],
  [
    "getLeaderboard(kills, season)",
    () => q.getLeaderboard({ stat: "kills", direction: "desc", season }),
  ],
  [
    "getLeaderboard(kills, season, limit 5)",
    () =>
      q.getLeaderboard({ stat: "kills", direction: "desc", season, limit: 5 }),
  ],
  ["getTeamStandings(season)", () => q.getTeamStandings({ season })],
  [
    "getTeamStandings(season, division)",
    () => q.getTeamStandings({ season, division: team.division }),
  ],
  ["getTeamOptions", () => q.getTeamOptions()],
  ["getFaceitPlayerStats(all)", () => faceit.getFaceitPlayerStats()],
  [
    "getFaceitPlayerStats([player])",
    () => faceit.getFaceitPlayerStats(undefined, [steamid64]),
  ],
  ["getFaceitTeamStats(all)", () => faceit.getFaceitTeamStats()],
  ["getFaceitPlayer", () => faceit.getFaceitPlayer(steamid64)],
  ["getTeamRoster", () => q.getTeamRoster(team.teamId)],
  ["getTeamDemoMatches", () => q.getTeamDemoMatches(team.teamId)],
  ["getTeamMapStats", () => q.getTeamMapStats(team.teamId)],
  ["getRecentResults", () => q.getRecentResults(team.teamId)],
  ["getFutureOpponents", () => q.getFutureOpponents(team.teamId)],
  ["getDemoMatches(all)", () => q.getDemoMatches()],
  ["getDemoMatchById", () => q.getDemoMatchById(matchId)],
  ["getDemoMatchPlayerStats", () => q.getDemoMatchPlayerStats(matchId)],
  ["getDemoRatingDetails", () => q.getDemoRatingDetails(matchId)],
  ["getMatchKills", () => q.getMatchKills(matchId)],
  ["getPlayerBySteamId64", () => q.getPlayerBySteamId64(steamid64)],
  ["getPlayerMatchHistory", () => q.getPlayerMatchHistory(steamid64)],
  ["getPlayerKills", () => q.getPlayerKills(steamid64)],
  ["getLeagueAverageStats", () => q.getLeagueAverageStats()],
  ["getMatchTeams", () => q.getMatchTeams(season ?? "")],
]

for (const [name, fn] of cases) {
  try {
    await time(name, fn)
  } catch (error) {
    console.log(`${name.padEnd(42)} ERROR ${(error as Error).message}`)
  }
}

import { eq, sql } from "drizzle-orm"
import type { AppDb } from "./db/client"
import {
  matches,
  matchRounds,
  players,
  playerMatchStats,
  playerMatchRoundStats,
} from "./db/schema"
import type { RatingExtraction } from "./demo-rating"
import {
  calculatePlayerRating,
  RATING_VERSION,
  type RatingInput,
  type PlayerRatingSummary,
} from "./player-rating"

export function groupRatingFacts<T extends RatingInput & { steamid64: string }>(
  facts: T[]
) {
  const grouped = new Map<string, T[]>()
  for (const fact of facts) {
    const bucket = grouped.get(fact.steamid64) ?? []
    bucket.push(fact)
    grouped.set(fact.steamid64, bucket)
  }
  return grouped
}

export async function getMatchRatingSummaries(
  database: AppDb,
  matchId: number
) {
  const facts = await database
    .select()
    .from(playerMatchRoundStats)
    .where(eq(playerMatchRoundStats.matchId, matchId))
  return new Map(
    [...groupRatingFacts(facts)].map(([id, rows]) => [
      id,
      calculatePlayerRating(rows),
    ])
  )
}

type WritableTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0]

async function writeRating(
  tx: WritableTransaction,
  matchId: number,
  steamid64: string,
  summary: PlayerRatingSummary | undefined,
  reason: string
) {
  await tx.run(sql`
    UPDATE player_match_stats SET rating = ${summary?.rating ?? null},
      rating_version = ${summary ? RATING_VERSION : null},
      rating_rounds = ${summary?.rounds ?? null},
      rating_unavailable_reason = ${summary ? null : reason}
    WHERE match_id = ${matchId} AND steamid64 = ${steamid64}
  `)
}

export async function persistRatingExtraction(
  database: AppDb,
  matchId: number,
  extraction: RatingExtraction
) {
  if (
    extraction.unavailableReason &&
    (extraction.rounds.length || extraction.facts.length)
  ) {
    throw new Error("Unrated extraction must not contain scoring facts")
  }
  if (
    !extraction.unavailableReason &&
    (!extraction.rounds.length || !extraction.facts.length)
  ) {
    throw new Error("Eligible extraction must contain complete round facts")
  }
  const grouped = groupRatingFacts(extraction.facts)
  const summaries = new Map(
    [...grouped].map(([id, rows]) => [id, calculatePlayerRating(rows)])
  )
  await database.transaction(async (tx) => {
    const match = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.id, matchId))
    if (!match.length) throw new Error(`Unknown demo ${matchId}`)
    await tx
      .delete(playerMatchRoundStats)
      .where(eq(playerMatchRoundStats.matchId, matchId))
    await tx.delete(matchRounds).where(eq(matchRounds.matchId, matchId))
    if (!extraction.unavailableReason) {
      const now = new Date().toISOString()
      for (const [id, rows] of grouped) {
        await tx
          .insert(players)
          .values({
            steamid64: id,
            latestIngameName: rows.at(-1)!.name,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .onConflictDoNothing()
        const summary = summaries.get(id)!
        const finalRound = extraction.rounds.at(-1)!.ordinal
        const finalFact = rows.find((row) => row.ordinal === finalRound)
        await tx
          .insert(playerMatchStats)
          .values({
            matchId,
            steamid64: id,
            teamName: finalFact ? String(finalFact.side) : null,
            kills: summary.kills,
            deaths: summary.deaths,
            assists: summary.assists,
            headshotKills: summary.headshotKills,
            damageTotal: summary.damage,
            utilityDamageTotal: summary.utilityDamage,
            clutchCount: summary.clutchWins,
            adr: summary.damage / summary.rounds,
            hsPct: summary.kills ? summary.headshotKills / summary.kills : null,
          })
          .onConflictDoNothing()
      }
      const inserted = await tx
        .insert(matchRounds)
        .values(extraction.rounds.map((round) => ({ matchId, ...round })))
        .returning({ id: matchRounds.id, ordinal: matchRounds.ordinal })
      const ids = new Map(inserted.map((round) => [round.ordinal, round.id]))
      for (let start = 0; start < extraction.facts.length; start += 100) {
        await tx.insert(playerMatchRoundStats).values(
          extraction.facts.slice(start, start + 100).map((fact) => {
            const { name, ordinal, ...stored } = fact
            if (!name || !ids.has(ordinal))
              throw new Error("Fact has no verified player name or round")
            return { ...stored, matchId, roundId: ids.get(ordinal)! }
          })
        )
      }
    }
    const rows = await tx
      .select({ steamid64: playerMatchStats.steamid64 })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, matchId))
    for (const row of rows) {
      await writeRating(
        tx,
        matchId,
        row.steamid64,
        summaries.get(row.steamid64),
        extraction.unavailableReason ?? "No eligible participated rounds"
      )
    }
  })
  return summaries.size
}

export async function recomputeMatchRatings(
  database: AppDb,
  matchId: number,
  dryRun = false
) {
  const summaries = await getMatchRatingSummaries(database, matchId)
  const rows = await database
    .select({
      steamid64: playerMatchStats.steamid64,
      reason: playerMatchStats.ratingUnavailableReason,
    })
    .from(playerMatchStats)
    .where(eq(playerMatchStats.matchId, matchId))
  if (!dryRun) {
    await database.transaction(async (tx) => {
      for (const row of rows) {
        await writeRating(
          tx,
          matchId,
          row.steamid64,
          summaries.get(row.steamid64),
          row.reason ?? "No eligible participated rounds"
        )
      }
    })
  }
  return summaries.size
}

export const ratingAverageSql = sql`
  SUM(CASE WHEN pms.rating_version = ${RATING_VERSION} THEN pms.rating * pms.rating_rounds END)
  / NULLIF(SUM(CASE WHEN pms.rating IS NOT NULL AND pms.rating_version = ${RATING_VERSION}
    THEN pms.rating_rounds END), 0)
`
export const ratedGamesSql = sql`
  COUNT(DISTINCT CASE WHEN pms.rating IS NOT NULL AND pms.rating_version = ${RATING_VERSION}
    THEN pms.match_id END)
`

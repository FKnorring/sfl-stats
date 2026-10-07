import * as cheerio from "cheerio"
import {
  MATCH_THRESHOLD_HIGH,
  normalizeName,
  scoreSimilarity,
} from "@/lib/matching"
import type { MatchTeam } from "@/lib/matches"

export type OfficialStanding = {
  rank: number
  teamName: string
  played: number
  wins: number
  draws: number
  losses: number
  forfeits: number
  scoreFor: number
  scoreAgainst: number
  scoreDifference: number
  points: number
}

const metrics = {
  Played: "played",
  Wins: "wins",
  Draws: "draws",
  Losses: "losses",
  Forfeits: "forfeits",
  "Score For": "scoreFor",
  "Score Against": "scoreAgainst",
  "Score Difference": "scoreDifference",
  Points: "points",
} as const

export function parseStandingsWidget(html: string): OfficialStanding[] {
  const $ = cheerio.load(html)
  const ranking = $(".ranking.format-sheet")
  if (ranking.length !== 1)
    throw new Error("Expected one official division ranking")
  const headers = ranking
    .find(".ranking-title .metric abbr")
    .toArray()
    .map((el) => $(el).attr("title"))
  if (
    headers.length !== 9 ||
    Object.keys(metrics).some(
      (key) => headers.filter((label) => label === key).length !== 1
    )
  ) {
    throw new Error("Unrecognized official ranking columns")
  }
  function integer(value: string): number {
    if (!/^-?\d+$/.test(value.trim()))
      throw new Error("Invalid official ranking statistic")
    const number = Number(value)
    if (!Number.isSafeInteger(number))
      throw new Error("Invalid official ranking statistic")
    return number
  }
  const rows = ranking
    .find(".ranking-item")
    .toArray()
    .map((el) => {
      const row = $(el)
      const teamName = row
        .find(".name")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
      const rank = integer(row.find(".rank").first().text())
      const values = row
        .find(".metric")
        .toArray()
        .map((metric) => integer($(metric).text()))
      if (!teamName || rank < 1 || values.length !== headers.length)
        throw new Error("Invalid official ranking row")
      const value = (label: keyof typeof metrics) =>
        values[headers.indexOf(label)]
      const result: OfficialStanding = {
        rank,
        teamName,
        played: value("Played"),
        wins: value("Wins"),
        draws: value("Draws"),
        losses: value("Losses"),
        forfeits: value("Forfeits"),
        scoreFor: value("Score For"),
        scoreAgainst: value("Score Against"),
        scoreDifference: value("Score Difference"),
        points: value("Points"),
      }
      if (
        Object.entries(result).some(
          ([key, value]) =>
            typeof value === "number" &&
            key !== "scoreDifference" &&
            key !== "points" &&
            value < 0
        )
      ) {
        throw new Error("Negative official ranking statistic")
      }
      return result
    })
  if (!rows.length) throw new Error("Official ranking has no team rows")
  return rows
}

export function resolveOfficialTeam(
  name: string,
  teams: MatchTeam[]
): MatchTeam | null {
  if (!normalizeName(name)) return null
  const exact = teams.filter(
    (team) => normalizeName(team.teamName) === normalizeName(name)
  )
  if (exact.length) return exact.length === 1 ? exact[0] : null
  const candidates = teams
    .map((team) => ({ team, score: scoreSimilarity(name, team.teamName) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD_HIGH)
    .sort((a, b) => b.score - a.score)
  if (!candidates.length || candidates[0].score === candidates[1]?.score)
    return null
  return candidates[0].team
}

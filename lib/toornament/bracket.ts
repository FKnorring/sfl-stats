import * as cheerio from "cheerio"

export type BracketSlot = {
  /** Null while the slot is still waiting on an earlier match. */
  name: string | null
  logoPath: string | null
  score: number | null
  result: "win" | "loss" | null
  /** Filled in locally ahead of Toornament, see `applyAdvancers`. */
  assumed?: boolean
}

export type BracketMatchStatus = "completed" | "pending" | "waiting"

export type BracketMatch = {
  id: string
  /** Toornament's label, e.g. "WB 4.2". */
  label: string
  /** Column index into `BracketData.rounds`. */
  round: number
  /** Position and size inside the bracket canvas, in rem. */
  x: number
  y: number
  width: number
  height: number
  teamA: BracketSlot
  teamB: BracketSlot
  /** ISO timestamp (UTC) when Toornament has one scheduled. */
  scheduledAt: string | null
  /** Match whose slot the winner of this one fills, from the bracket links. */
  nextMatchId: string | null
  /**
   * completed: a winner is decided; pending: both teams known, not played;
   * waiting: at least one team still depends on an earlier match.
   */
  status: BracketMatchStatus
}

export type BracketData = {
  rounds: string[]
  /** Canvas size in rem. */
  width: number
  height: number
  matches: BracketMatch[]
  /** Connector polylines in rem, each flagged when its source match is decided. */
  links: { points: [number, number][]; decided: boolean }[]
}

function rem(style: string, prop: string): number | null {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)rem`).exec(style)
  return m ? Number(m[1]) : null
}

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Parses Toornament's bracket stage widget
 * (`widget.toornament.com/tournaments/{id}/stages/{id}/`), which is
 * server-rendered like the schedule widget: absolutely positioned match
 * cards plus an SVG of connector polylines in 1/1000 rem. The round column
 * for a card is recovered from its `left` offset, and `nextMatchId` from the
 * connector that leaves the card's right edge.
 */
export function parseBracketWidget(html: string): BracketData | null {
  const $ = cheerio.load(html)
  const canvas = $(".bracket").first()
  if (!canvas.length) return null
  const canvasStyle = canvas.attr("style") ?? ""
  const width = rem(canvasStyle, "width")
  const height = rem(canvasStyle, "height")
  if (width === null || height === null) return null

  const rounds = $(".structure-round .title")
    .toArray()
    .map((el) => clean($(el).text()))

  type Raw = Omit<BracketMatch, "round" | "nextMatchId">
  const raw: Raw[] = []
  canvas.find(".bracket-nodes > div").each((_, node) => {
    const style = $(node).attr("style") ?? ""
    const match = $(node).find('.match[data-type="match"]').first()
    const id = match.attr("data-id")?.trim()
    const x = rem(style, "left")
    const y = rem(style, "top")
    const w = rem(style, "width")
    const h = rem(style, "height")
    if (!id || x === null || y === null || w === null || h === null) return

    const slots = match
      .find(".opponent")
      .toArray()
      .map((el): BracketSlot => {
        const opponent = $(el)
        const nameEl = opponent.find(".name").first()
        const name = clean(nameEl.text()) || null
        const scoreText = clean(opponent.find(".result").first().text())
        const score =
          scoreText !== "" && Number.isFinite(Number(scoreText))
            ? Number(scoreText)
            : null
        const classes = `${nameEl.attr("class") ?? ""} ${opponent.find(".result").first().attr("class") ?? ""}`
        return {
          name,
          logoPath: opponent.find(".logo img").first().attr("src") || null,
          score,
          result: /\bwin\b/.test(classes)
            ? "win"
            : /\bloss\b/.test(classes)
              ? "loss"
              : null,
        }
      })
    if (slots.length < 2) return
    const [teamA, teamB] = slots

    const stamp = match.find(".state datetime-view").first().attr("value")
    const parsed = stamp ? new Date(stamp) : null
    const scheduledAt =
      parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null

    const decided = teamA.result === "win" || teamB.result === "win"
    const status: BracketMatchStatus = decided
      ? "completed"
      : teamA.name && teamB.name
        ? "pending"
        : "waiting"

    raw.push({
      id,
      label: clean(match.find(".header .name").first().text()),
      x,
      y,
      width: w,
      height: h,
      teamA,
      teamB,
      scheduledAt,
      status,
    })
  })
  if (!raw.length) return null

  const columns = [...new Set(raw.map((m) => m.x))].sort((a, b) => a - b)
  const links = canvas
    .find(".bracket-links polyline")
    .toArray()
    .flatMap((el) => {
      const points = ($(el).attr("points") ?? "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite))
        .map(([px, py]): [number, number] => [px / 1000, py / 1000])
      if (points.length < 2) return []
      return [
        {
          points,
          decided: /\bwinner\b/.test($(el).attr("class") ?? ""),
        },
      ]
    })

  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  const nextOf = new Map<string, string>()
  for (const link of links) {
    const start = link.points[0]
    const end = link.points[link.points.length - 1]
    const from = raw.find(
      (m) => near(m.x + m.width, start[0]) && near(m.y + m.height / 2, start[1])
    )
    const to = raw.find(
      (m) => near(m.x, end[0]) && near(m.y + m.height / 2, end[1])
    )
    if (from && to) nextOf.set(from.id, to.id)
  }

  const matches = raw.map((m): BracketMatch => ({
    ...m,
    round: columns.indexOf(m.x),
    nextMatchId: nextOf.get(m.id) ?? null,
  }))
  return { rounds, width, height, matches, links }
}

/** Title of the first round that still has an undecided match. */
export function currentRoundIndex(bracket: BracketData): number | null {
  const open = bracket.matches
    .filter((m) => m.status !== "completed")
    .map((m) => m.round)
  return open.length ? Math.min(...open) : null
}

export type PreviewSide =
  | {
      kind: "team"
      name: string
      logoPath: string | null
      /** Advanced locally before Toornament recorded the result. */
      assumed?: boolean
    }
  | { kind: "candidates"; names: string[]; logoPaths: (string | null)[] }
  | { kind: "unknown" }

export type MatchPreview = {
  match: BracketMatch
  sides: [PreviewSide, PreviewSide]
}

/**
 * Upcoming semifinal/final matches worth previewing. A slot that is still
 * waiting on exactly one undecided feeder match lists that match's two teams
 * as candidates; any other empty slot stays unknown. Matches with no known
 * team on either side are skipped.
 */
export function previewMatches(bracket: BracketData): MatchPreview[] {
  const firstRound = Math.max(0, bracket.rounds.length - 2)
  return bracket.matches
    .filter((m) => m.status !== "completed" && m.round >= firstRound)
    .sort((a, b) => a.round - b.round || a.y - b.y)
    .flatMap((match) => {
      const open = bracket.matches.filter(
        (m) => m.nextMatchId === match.id && m.status !== "completed"
      )
      const emptySlots = [match.teamA, match.teamB].filter((s) => !s.name)
      const side = (slot: BracketSlot): PreviewSide => {
        if (slot.name)
          return {
            kind: "team",
            name: slot.name,
            logoPath: slot.logoPath,
            ...(slot.assumed ? { assumed: true } : {}),
          }
        const feeder = emptySlots.length === 1 && open.length === 1 && open[0]
        const all = feeder
          ? [feeder.teamA, feeder.teamB].filter((s) => s.name)
          : []
        const teams = all
        return teams.length
          ? {
              kind: "candidates",
              names: teams.map((s) => s.name as string),
              logoPaths: teams.map((s) => s.logoPath),
            }
          : { kind: "unknown" }
      }
      const sides: [PreviewSide, PreviewSide] = [
        side(match.teamA),
        side(match.teamB),
      ]
      return sides.every((s) => s.kind === "unknown") ? [] : [{ match, sides }]
    })
}

/**
 * Applies results Toornament hasn't recorded yet: in each undecided match with
 * a known team from `advancers`, that team is marked the winner and moved into
 * the next match's empty slot. Scores stay blank. Returns a new bracket.
 */
export function applyAdvancers(
  bracket: BracketData,
  advancers: string[]
): BracketData {
  const matches = bracket.matches.map((m) => ({
    ...m,
    teamA: { ...m.teamA },
    teamB: { ...m.teamB },
  }))
  const byId = new Map(matches.map((m) => [m.id, m]))
  // Only matches pending on Toornament, so a team moved into the next round
  // is not also treated as winning that round.
  const undecided = new Set(
    bracket.matches.filter((m) => m.status === "pending").map((m) => m.id)
  )
  for (const match of matches) {
    if (!undecided.has(match.id)) continue
    const winners = [match.teamA, match.teamB].filter(
      (s) => s.name && advancers.includes(s.name)
    )
    if (winners.length !== 1) continue
    const winner = winners[0]
    const loser = winner === match.teamA ? match.teamB : match.teamA
    winner.result = "win"
    loser.result = "loss"
    match.status = "completed"
    const next = match.nextMatchId ? byId.get(match.nextMatchId) : undefined
    const slot = next && [next.teamA, next.teamB].find((s) => !s.name)
    if (next && slot) {
      slot.name = winner.name
      slot.logoPath = winner.logoPath
      slot.assumed = true
      if (next.teamA.name && next.teamB.name && next.status === "waiting")
        next.status = "pending"
    }
  }
  return { ...bracket, matches }
}

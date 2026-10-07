import type { Block } from "@/lib/roster-types"
import type { ScrapedTeam } from "@/lib/roster-types"
import { parseTeamBlock } from "@/lib/roster-parse"

const GAME_TITLE = "Counter-Strike 2"

function asBlockArray(value: unknown): Block[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is Block =>
      !!v &&
      typeof v === "object" &&
      "system" in v &&
      "fields" in v &&
      typeof (v as Block).system?.contentType === "string"
  )
}

function fieldString(block: Block, key: string): string | undefined {
  const v = block.fields[key]
  return typeof v === "string" ? v : undefined
}

/**
 * Scan one game tab's flat block sequence (publiclir.se nests divisions as
 * a repeating headlineBlock("Division X") -> toornamentEmbedBlock ->
 * headlineBlock("Lineups") -> contentGridBlock pattern) and pull out every
 * team's lineup grid.
 */
function scanGameTab(itemContent: Block[], season: string): ScrapedTeam[] {
  const teams: ScrapedTeam[] = []
  let currentDivision: string | null = null
  let lastHeadline: string | null = null

  for (const block of itemContent) {
    const ct = block.system.contentType

    if (ct === "headlineBlock") {
      const headline = (fieldString(block, "headline") ?? "").trim()
      lastHeadline = headline
      if (/^division/i.test(headline)) {
        currentDivision = headline
      }
      continue
    }

    if (
      ct === "contentGridBlock" &&
      lastHeadline === "Lineups" &&
      currentDivision
    ) {
      const gridItems = asBlockArray(block.fields.contentArea)
      for (const item of gridItems) {
        if (item.system.contentType !== "richTextEditorBlock") continue
        const bodyText = fieldString(item, "bodyText")
        if (!bodyText) continue
        const parsed = parseTeamBlock(bodyText)
        if (!parsed) {
          console.warn(
            `[scrape-roster] could not parse team block in ${season} / ${currentDivision}`
          )
          continue
        }
        teams.push({
          teamName: parsed.teamName,
          season,
          division: currentDivision,
          players: parsed.players,
        })
      }
      // Reset so a later, unrelated contentGridBlock doesn't get mistaken
      // for lineups if a page edit ever drops the trailing headline.
      lastHeadline = null
    }
  }

  return teams
}

/**
 * Walk the whole page JSON tree, find every "SFL Säsong …" season tab and,
 * within it, the "Counter-Strike 2" game tab, and extract all teams/players
 * from its division lineup grids.
 */
function visitCs2Tabs(
  contentArea: Block[],
  visit: (blocks: Block[], season: string) => void
) {
  function walk(node: unknown, season: string | null) {
    const blocks = asBlockArray(node)
    for (const block of blocks) {
      const ct = block.system.contentType
      const title = fieldString(block, "itemTitle")

      let nextSeason = season
      if (ct === "contentBoxItem" && title && /säsong/i.test(title)) {
        nextSeason = title
      }

      if (ct === "contentBoxItem" && title === GAME_TITLE && nextSeason) {
        const itemContent = asBlockArray(block.fields.itemContent)
        visit(itemContent, nextSeason)
      }

      for (const value of Object.values(block.fields)) {
        if (Array.isArray(value)) walk(value, nextSeason)
      }
    }
  }

  walk(contentArea, null)
}

export function extractCs2Rosters(contentArea: Block[]): ScrapedTeam[] {
  const teams: ScrapedTeam[] = []
  visitCs2Tabs(contentArea, (blocks, season) => {
    teams.push(...scanGameTab(blocks, season))
  })
  return teams
}

export function extractCs2DivisionStages(contentArea: Block[]) {
  const stages: { season: string; division: string; path: string }[] = []
  visitCs2Tabs(contentArea, (blocks, season) => {
    let division: string | null = null
    for (const block of blocks) {
      if (block.system.contentType === "headlineBlock") {
        const title = fieldString(block, "headline")?.trim()
        if (title && /^division/i.test(title)) division = title
      }
      const path = fieldString(block, "embedPath")
      if (
        division &&
        block.system.contentType === "toornamentEmbedBlock" &&
        path &&
        /^\/tournaments\/\d+\/stages\/\d+\/(?:\?_locale=[a-z]{2}_[A-Z]{2})?$/.test(
          path
        )
      ) {
        stages.push({ season, division, path })
      }
    }
  })
  return stages
}

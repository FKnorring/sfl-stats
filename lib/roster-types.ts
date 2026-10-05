import { z } from "zod"

// Loose shape of the publiclir.se inline page-state blob. We only validate
// the parts of the tree we actually walk — the real page JSON has many more
// fields we don't care about.
const blockSystem = z.object({
  contentType: z.string(),
})

export type Block = {
  system: { contentType: string }
  fields: Record<string, unknown>
}

const blockSchema: z.ZodType<Block> = z.object({
  system: blockSystem,
  fields: z.record(z.string(), z.unknown()),
})

export const pageJsonSchema = z.object({
  pageContent: z.object({
    fields: z.object({
      contentArea: z.array(blockSchema),
    }),
  }),
})

export type PageJson = z.infer<typeof pageJsonSchema>

export type ScrapedPlayer = {
  nickname: string
  realName: string | null
}

export type ScrapedTeam = {
  teamName: string
  season: string
  division: string
  players: ScrapedPlayer[]
}

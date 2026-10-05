import { sql } from "drizzle-orm"
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core"

// Mirrors the table shapes previously hand-maintained in lib/schema.sql.
// This file is the schema source of truth going forward — schema changes
// are made here, then `pnpm db:generate` produces a migration from the
// diff (see docs/adr/0003-hosted-db-turso-libsql-drizzle.md).

export const players = sqliteTable("players", {
  steamid64: text("steamid64").primaryKey(),
  latestIngameName: text("latest_ingame_name").notNull(),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
})

export const teams = sqliteTable(
  "teams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    season: text("season").notNull(), // e.g. "SFL Säsong 9"
    division: text("division").notNull(), // e.g. "Division 1", "2A"
  },
  (t) => [
    uniqueIndex("teams_name_season_division_unique").on(
      t.name,
      t.season,
      t.division
    ),
  ]
)

// One row per roster-listed player per team/season, as scraped (source of truth pre-matching)
export const rosterEntries = sqliteTable(
  "roster_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    nickname: text("nickname").notNull(),
    realName: text("real_name"),
    matchedSteamid64: text("matched_steamid64").references(
      () => players.steamid64
    ),
    matchConfidence: real("match_confidence"),
    matchStatus: text("match_status")
      .notNull()
      .default("unmatched")
      .$type<"unmatched" | "auto_high" | "auto_low" | "manual" | "ambiguous">(),
    scrapedAt: text("scraped_at").notNull(),
  },
  (t) => [
    index("idx_roster_team").on(t.teamId),
    check(
      "roster_entries_match_status_check",
      sql`${t.matchStatus} IN ('unmatched', 'auto_high', 'auto_low', 'manual', 'ambiguous')`
    ),
  ]
)

// Permanent manual correction, mirrors data/player-overrides.json (git-tracked source of truth)
export const playerNameOverrides = sqliteTable("player_name_overrides", {
  steamid64: text("steamid64")
    .primaryKey()
    .references(() => players.steamid64),
  rosterEntryId: integer("roster_entry_id")
    .notNull()
    .references(() => rosterEntries.id),
  note: text("note"),
  createdAt: text("created_at").notNull(),
})

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Just the demo's basename (e.g. "2026-10-01_19-05-47_22_de_nuke_....dem"),
  // not an absolute path — demos are always downloaded fresh from the same
  // SharePoint source, so the local --dir a maintainer ingests from varies
  // between machines/runs while the filename itself is stable and unique
  // (SFL's naming scheme embeds a timestamp + sequence number). Storing the
  // full local path would make the uniqueness check (and re-ingestion
  // dedup) depend on where the demo happens to live on disk.
  fileName: text("file_name").notNull().unique(),
  mapName: text("map_name"),
  serverName: text("server_name"),
  demoDate: text("demo_date"),
  totalRounds: integer("total_rounds"),
  // Resolved only when exactly two distinct roster teams are matched among
  // this demo's players (see scripts/ingest-demos.ts) — round wins tallied
  // from round_end events' winning side, attributed to a team via each
  // matched player's side at that round's tick (sides swap at halftime).
  teamAId: integer("team_a_id").references(() => teams.id),
  teamAScore: integer("team_a_score"),
  teamBId: integer("team_b_id").references(() => teams.id),
  teamBScore: integer("team_b_score"),
  parsedAt: text("parsed_at").notNull(),
})

export const playerMatchStats = sqliteTable(
  "player_match_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    steamid64: text("steamid64")
      .notNull()
      .references(() => players.steamid64),
    teamName: text("team_name"),
    kills: integer("kills").notNull(),
    deaths: integer("deaths").notNull(),
    assists: integer("assists").notNull(),
    headshotKills: integer("headshot_kills").notNull(),
    damageTotal: integer("damage_total").notNull(),
    utilityDamageTotal: integer("utility_damage_total"),
    enemiesFlashedTotal: integer("enemies_flashed_total"),
    mvps: integer("mvps"),
    aceRounds: integer("ace_rounds"),
    rounds3k: integer("rounds_3k"),
    rounds4k: integer("rounds_4k"),
    equipmentValueTotal: integer("equipment_value_total"),
    adr: real("adr"),
    hsPct: real("hs_pct"),
    clutchCount: integer("clutch_count"),
  },
  (t) => [
    uniqueIndex("player_match_stats_match_steamid_unique").on(
      t.matchId,
      t.steamid64
    ),
    index("idx_pms_steamid").on(t.steamid64),
  ]
)

// Current Faceit identity + elo/skill snapshot per player.
export const faceitPlayers = sqliteTable(
  "faceit_players",
  {
    steamid64: text("steamid64")
      .primaryKey()
      .references(() => players.steamid64),
    faceitPlayerId: text("faceit_player_id").notNull(),
    nickname: text("nickname").notNull(),
    elo: integer("elo"),
    skillLevel: integer("skill_level"),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (t) => [index("idx_faceit_players_player_id").on(t.faceitPlayerId)]
)

// Per-match fact table for recent Faceit activity. Mirrors player_match_stats'
// pattern: store raw per-match facts and aggregate "last N days" at query
// time, so the window can change later without re-fetching from the API.
export const faceitMatchStats = sqliteTable(
  "faceit_match_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    steamid64: text("steamid64")
      .notNull()
      .references(() => players.steamid64),
    faceitMatchId: text("faceit_match_id").notNull(),
    playedAt: text("played_at").notNull(), // ISO, from the match's started_at/finished_at
    kills: integer("kills"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    kdRatio: real("kd_ratio"),
    adr: real("adr"),
    hsPct: real("hs_pct"),
    eloAtMatch: integer("elo_at_match"), // likely NULL; Faceit may not expose per-match elo
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [
    uniqueIndex("faceit_match_stats_steamid_match_unique").on(
      t.steamid64,
      t.faceitMatchId
    ),
    index("idx_faceit_match_stats_steamid").on(t.steamid64),
  ]
)

// Scraped from the Toornament schedule widget (publiclir.se's embedded
// SFL bracket). One row per match, each side resolved to a known teams row
// when the scraped name matches confidently (see lib/matching.ts) — left
// NULL otherwise, same "store the raw fact, resolve identity separately"
// convention as roster_entries.matched_steamid64.
export const toornamentMatches = sqliteTable(
  "toornament_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    toornamentMatchId: text("toornament_match_id").notNull().unique(),
    scheduledAt: text("scheduled_at"),
    roundLabel: text("round_label"),
    teamANameRaw: text("team_a_name_raw").notNull(),
    teamBNameRaw: text("team_b_name_raw").notNull(),
    teamAId: integer("team_a_id").references(() => teams.id),
    teamBId: integer("team_b_id").references(() => teams.id),
    // set once status = 'completed', from the widget's .result text
    teamAScore: integer("team_a_score"),
    teamBScore: integer("team_b_score"),
    status: text("status")
      .notNull()
      .$type<"pending" | "running" | "completed">(),
    scrapedAt: text("scraped_at").notNull(),
  },
  (t) => [
    index("idx_toornament_matches_team_a").on(t.teamAId),
    index("idx_toornament_matches_team_b").on(t.teamBId),
    check(
      "toornament_matches_status_check",
      sql`${t.status} IN ('pending', 'running', 'completed')`
    ),
  ]
)

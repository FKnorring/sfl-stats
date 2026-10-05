-- Canonical player identity, keyed by the one stable ID in demos
CREATE TABLE IF NOT EXISTS players (
  steamid64 TEXT PRIMARY KEY,
  latest_ingame_name TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  season TEXT NOT NULL,              -- e.g. "SFL Säsong 9"
  division TEXT NOT NULL,            -- e.g. "Division 1", "2A"
  UNIQUE(name, season, division)
);

-- One row per roster-listed player per team/season, as scraped (source of truth pre-matching)
CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  nickname TEXT NOT NULL,
  real_name TEXT,
  matched_steamid64 TEXT REFERENCES players(steamid64),
  match_confidence REAL,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'auto_high', 'auto_low', 'manual', 'ambiguous')),
  scraped_at TEXT NOT NULL
);

-- Permanent manual correction, mirrors data/player-overrides.json (git-tracked source of truth)
CREATE TABLE IF NOT EXISTS player_name_overrides (
  steamid64 TEXT PRIMARY KEY REFERENCES players(steamid64),
  roster_entry_id INTEGER NOT NULL REFERENCES roster_entries(id),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  map_name TEXT,
  server_name TEXT,
  demo_date TEXT,
  total_rounds INTEGER,
  parsed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_match_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  steamid64 TEXT NOT NULL REFERENCES players(steamid64),
  team_name TEXT,
  kills INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  headshot_kills INTEGER NOT NULL,
  damage_total INTEGER NOT NULL,
  utility_damage_total INTEGER,
  enemies_flashed_total INTEGER,
  mvps INTEGER,
  ace_rounds INTEGER,
  rounds_3k INTEGER,
  rounds_4k INTEGER,
  equipment_value_total INTEGER,
  adr REAL,
  hs_pct REAL,
  clutch_count INTEGER,
  UNIQUE(match_id, steamid64)
);

CREATE INDEX IF NOT EXISTS idx_pms_steamid ON player_match_stats(steamid64);
CREATE INDEX IF NOT EXISTS idx_roster_team ON roster_entries(team_id);

-- Current Faceit identity + elo/skill snapshot per player.
CREATE TABLE IF NOT EXISTS faceit_players (
  steamid64 TEXT PRIMARY KEY REFERENCES players(steamid64),
  faceit_player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  elo INTEGER,
  skill_level INTEGER,
  last_synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_faceit_players_player_id ON faceit_players(faceit_player_id);

-- Per-match fact table for recent Faceit activity. Mirrors player_match_stats'
-- pattern: store raw per-match facts and aggregate "last N days" at query
-- time, so the window can change later without re-fetching from the API.
CREATE TABLE IF NOT EXISTS faceit_match_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steamid64 TEXT NOT NULL REFERENCES players(steamid64),
  faceit_match_id TEXT NOT NULL,
  played_at TEXT NOT NULL,       -- ISO, from the match's started_at/finished_at
  kills INTEGER,
  deaths INTEGER,
  assists INTEGER,
  kd_ratio REAL,
  adr REAL,
  hs_pct REAL,
  elo_at_match INTEGER,          -- likely NULL; Faceit may not expose per-match elo
  fetched_at TEXT NOT NULL,
  UNIQUE(steamid64, faceit_match_id)
);

CREATE INDEX IF NOT EXISTS idx_faceit_match_stats_steamid ON faceit_match_stats(steamid64);

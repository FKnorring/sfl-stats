CREATE TABLE `faceit_match_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steamid64` text NOT NULL,
	`faceit_match_id` text NOT NULL,
	`played_at` text NOT NULL,
	`kills` integer,
	`deaths` integer,
	`assists` integer,
	`kd_ratio` real,
	`adr` real,
	`hs_pct` real,
	`elo_at_match` integer,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faceit_match_stats_steamid_match_unique` ON `faceit_match_stats` (`steamid64`,`faceit_match_id`);--> statement-breakpoint
CREATE INDEX `idx_faceit_match_stats_steamid` ON `faceit_match_stats` (`steamid64`);--> statement-breakpoint
CREATE TABLE `faceit_players` (
	`steamid64` text PRIMARY KEY NOT NULL,
	`faceit_player_id` text NOT NULL,
	`nickname` text NOT NULL,
	`elo` integer,
	`skill_level` integer,
	`last_synced_at` text NOT NULL,
	FOREIGN KEY (`steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_faceit_players_player_id` ON `faceit_players` (`faceit_player_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`map_name` text,
	`server_name` text,
	`demo_date` text,
	`total_rounds` integer,
	`team_a_id` integer,
	`team_a_score` integer,
	`team_b_id` integer,
	`team_b_score` integer,
	`parsed_at` text NOT NULL,
	FOREIGN KEY (`team_a_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_b_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_file_path_unique` ON `matches` (`file_path`);--> statement-breakpoint
CREATE TABLE `player_match_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`steamid64` text NOT NULL,
	`team_name` text,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`assists` integer NOT NULL,
	`headshot_kills` integer NOT NULL,
	`damage_total` integer NOT NULL,
	`utility_damage_total` integer,
	`enemies_flashed_total` integer,
	`mvps` integer,
	`ace_rounds` integer,
	`rounds_3k` integer,
	`rounds_4k` integer,
	`equipment_value_total` integer,
	`adr` real,
	`hs_pct` real,
	`clutch_count` integer,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_match_stats_match_steamid_unique` ON `player_match_stats` (`match_id`,`steamid64`);--> statement-breakpoint
CREATE INDEX `idx_pms_steamid` ON `player_match_stats` (`steamid64`);--> statement-breakpoint
CREATE TABLE `player_name_overrides` (
	`steamid64` text PRIMARY KEY NOT NULL,
	`roster_entry_id` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`roster_entry_id`) REFERENCES `roster_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`steamid64` text PRIMARY KEY NOT NULL,
	`latest_ingame_name` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`nickname` text NOT NULL,
	`real_name` text,
	`matched_steamid64` text,
	`match_confidence` real,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`scraped_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "roster_entries_match_status_check" CHECK("roster_entries"."match_status" IN ('unmatched', 'auto_high', 'auto_low', 'manual', 'ambiguous'))
);
--> statement-breakpoint
CREATE INDEX `idx_roster_team` ON `roster_entries` (`team_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`season` text NOT NULL,
	`division` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_season_division_unique` ON `teams` (`name`,`season`,`division`);--> statement-breakpoint
CREATE TABLE `toornament_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`toornament_match_id` text NOT NULL,
	`scheduled_at` text,
	`round_label` text,
	`team_a_name_raw` text NOT NULL,
	`team_b_name_raw` text NOT NULL,
	`team_a_id` integer,
	`team_b_id` integer,
	`team_a_score` integer,
	`team_b_score` integer,
	`status` text NOT NULL,
	`scraped_at` text NOT NULL,
	FOREIGN KEY (`team_a_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_b_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "toornament_matches_status_check" CHECK("toornament_matches"."status" IN ('pending', 'running', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `toornament_matches_toornament_match_id_unique` ON `toornament_matches` (`toornament_match_id`);--> statement-breakpoint
CREATE INDEX `idx_toornament_matches_team_a` ON `toornament_matches` (`team_a_id`);--> statement-breakpoint
CREATE INDEX `idx_toornament_matches_team_b` ON `toornament_matches` (`team_b_id`);
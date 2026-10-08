CREATE TABLE `match_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`raw_round` integer NOT NULL,
	`start_tick` integer NOT NULL,
	`freeze_tick` integer NOT NULL,
	`end_tick` integer NOT NULL,
	`winner` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_rounds_match_ordinal` ON `match_rounds` (`match_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `player_match_round_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`round_id` integer NOT NULL,
	`steamid64` text NOT NULL,
	`side` integer NOT NULL,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`assists` integer NOT NULL,
	`flash_assists` integer NOT NULL,
	`headshot_kills` integer NOT NULL,
	`damage` integer NOT NULL,
	`utility_damage` integer NOT NULL,
	`survived` integer NOT NULL,
	`traded` integer NOT NULL,
	`opening_kills` integer NOT NULL,
	`opening_deaths` integer NOT NULL,
	`clutch_wins` integer NOT NULL,
	`clutch_opponents` integer NOT NULL,
	`equipment_value` integer,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `match_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`steamid64`) REFERENCES `players`(`steamid64`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_round_stats_round_player` ON `player_match_round_stats` (`round_id`,`steamid64`);--> statement-breakpoint
CREATE INDEX `player_round_stats_match_player` ON `player_match_round_stats` (`match_id`,`steamid64`);--> statement-breakpoint
ALTER TABLE `player_match_stats` ADD `rating` real;--> statement-breakpoint
ALTER TABLE `player_match_stats` ADD `rating_version` text;--> statement-breakpoint
ALTER TABLE `player_match_stats` ADD `rating_rounds` integer;--> statement-breakpoint
ALTER TABLE `player_match_stats` ADD `rating_unavailable_reason` text DEFAULT 'Not enriched';
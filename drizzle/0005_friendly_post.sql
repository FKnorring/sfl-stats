PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`map_name` text,
	`server_name` text,
	`demo_date` text,
	`total_rounds` integer,
	`team_a_id` integer,
	`team_a_score` integer,
	`team_b_id` integer,
	`team_b_score` integer,
	`team_a_resolution` text,
	`team_b_resolution` text,
	`team_resolution_conflict` text,
	`parsed_at` text NOT NULL,
	FOREIGN KEY (`team_a_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_b_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matches_team_a_resolution_check" CHECK("__new_matches"."team_a_resolution" IS NULL OR "__new_matches"."team_a_resolution" IN ('player_match', 'toornament_inferred')),
	CONSTRAINT "matches_team_b_resolution_check" CHECK("__new_matches"."team_b_resolution" IS NULL OR "__new_matches"."team_b_resolution" IN ('player_match', 'toornament_inferred'))
);
--> statement-breakpoint
INSERT INTO `__new_matches`("id", "file_name", "map_name", "server_name", "demo_date", "total_rounds", "team_a_id", "team_a_score", "team_b_id", "team_b_score", "parsed_at") SELECT "id", "file_name", "map_name", "server_name", "demo_date", "total_rounds", "team_a_id", "team_a_score", "team_b_id", "team_b_score", "parsed_at" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `matches_file_name_unique` ON `matches` (`file_name`);
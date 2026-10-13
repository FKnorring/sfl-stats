CREATE TABLE `match_bomb_plant_ct_players` (
	`bomb_plant_id` integer NOT NULL,
	`steamid64` text NOT NULL,
	FOREIGN KEY (`bomb_plant_id`) REFERENCES `match_bomb_plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_bomb_plant_ct_players_unique` ON `match_bomb_plant_ct_players` (`bomb_plant_id`,`steamid64`);--> statement-breakpoint
CREATE INDEX `idx_match_bomb_plant_ct_players_steamid` ON `match_bomb_plant_ct_players` (`steamid64`);--> statement-breakpoint
CREATE TABLE `match_bomb_plants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`round` integer NOT NULL,
	`tick` integer NOT NULL,
	`planter_steamid64` text,
	`site` text,
	`place_name` text,
	`round_winner_side` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "match_bomb_plants_site_check" CHECK("match_bomb_plants"."site" IS NULL OR "match_bomb_plants"."site" IN ('A', 'B')),
	CONSTRAINT "match_bomb_plants_winner_check" CHECK("match_bomb_plants"."round_winner_side" IS NULL OR "match_bomb_plants"."round_winner_side" IN ('T', 'CT'))
);
--> statement-breakpoint
CREATE INDEX `idx_match_bomb_plants_match` ON `match_bomb_plants` (`match_id`);
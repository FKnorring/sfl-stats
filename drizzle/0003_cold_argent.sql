CREATE TABLE `match_kills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`round` integer NOT NULL,
	`tick` integer NOT NULL,
	`attacker_steamid64` text,
	`attacker_x` real,
	`attacker_y` real,
	`victim_steamid64` text NOT NULL,
	`victim_x` real,
	`victim_y` real,
	`weapon` text,
	`headshot` integer,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_match_kills_match` ON `match_kills` (`match_id`);
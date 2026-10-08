CREATE TABLE `cache_generation` (
	`id` integer PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	CONSTRAINT "cache_generation_singleton" CHECK("cache_generation"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `cache_generation` (`id`, `generation`) VALUES (1, 'initial');

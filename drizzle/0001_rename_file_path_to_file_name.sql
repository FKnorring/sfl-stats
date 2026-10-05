-- Custom SQL migration file, put your code below! --
-- Demos are always downloaded fresh from the same SharePoint source, so the
-- absolute local path a maintainer ingests from varies between
-- machines/runs while the filename itself is stable and unique (SFL's
-- naming scheme embeds a timestamp + sequence number) — store just the
-- basename instead of the full path. See lib/db/schema.ts.
ALTER TABLE `matches` RENAME COLUMN `file_path` TO `file_name`;
--> statement-breakpoint
DROP INDEX `matches_file_path_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_file_name_unique` ON `matches` (`file_name`);
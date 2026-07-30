CREATE TABLE IF NOT EXISTS `benchmark_points` (
	`benchmark_id` text NOT NULL,
	`date` text NOT NULL,
	`daily_return` real NOT NULL,
	PRIMARY KEY(`benchmark_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `benchmark_sync` (
	`benchmark_id` text PRIMARY KEY NOT NULL,
	`covers_from` text NOT NULL,
	`covers_to` text NOT NULL,
	`updated_at` integer
);

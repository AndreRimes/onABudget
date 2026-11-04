CREATE TABLE `dismissed_statement_rows` (
	`source_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dismissed_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bank_account_links` ADD `auto_sync_from` integer;
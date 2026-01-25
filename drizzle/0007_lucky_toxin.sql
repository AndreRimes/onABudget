DROP TABLE `user`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`account_type` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "user_id", "type", "account_type", "balance", "created_at") SELECT "id", "user_id", "type", "account_type", "balance", "created_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_budget` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`start_period` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`end_period` text,
	`user_id` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_budget`("id", "amount", "start_period", "end_period", "user_id") SELECT "id", "amount", "start_period", "end_period", "user_id" FROM `budget`;--> statement-breakpoint
DROP TABLE `budget`;--> statement-breakpoint
ALTER TABLE `__new_budget` RENAME TO `budget`;
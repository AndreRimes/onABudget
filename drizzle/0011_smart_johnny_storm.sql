CREATE TABLE `expense_ignore_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`pattern` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_ignore_rules_user_pattern_idx` ON `expense_ignore_rules` (`user_id`,`pattern`);
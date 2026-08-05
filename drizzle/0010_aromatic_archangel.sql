CREATE TABLE `expense_category_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`pattern` text NOT NULL,
	`category_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_category_rules_user_pattern_idx` ON `expense_category_rules` (`user_id`,`pattern`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`checking_account_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`day_of_month` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`checking_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `source` text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `source_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_source_hash_unique` ON `expenses` (`source_hash`);--> statement-breakpoint
CREATE INDEX `expenses_account_date_idx` ON `expenses` (`checking_account_id`,`expense_date`);
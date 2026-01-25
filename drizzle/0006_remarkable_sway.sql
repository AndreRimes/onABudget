PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`account_type` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "user_id", "type", "account_type", "balance", "created_at") SELECT "id", "user_id", "type", "account_type", "balance", "created_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_asset_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_asset_types`("id", "name", "description", "created_at") SELECT "id", "name", "description", "created_at" FROM `asset_types`;--> statement-breakpoint
DROP TABLE `asset_types`;--> statement-breakpoint
ALTER TABLE `__new_asset_types` RENAME TO `asset_types`;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_types_name_unique` ON `asset_types` (`name`);--> statement-breakpoint
CREATE TABLE `__new_budget` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`start_period` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`end_period` text,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_budget`("id", "amount", "start_period", "end_period", "user_id") SELECT "id", "amount", "start_period", "end_period", "user_id" FROM `budget`;--> statement-breakpoint
DROP TABLE `budget`;--> statement-breakpoint
ALTER TABLE `__new_budget` RENAME TO `budget`;--> statement-breakpoint
CREATE TABLE `__new_expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_expense_categories`("id", "name", "description", "created_at") SELECT "id", "name", "description", "created_at" FROM `expense_categories`;--> statement-breakpoint
DROP TABLE `expense_categories`;--> statement-breakpoint
ALTER TABLE `__new_expense_categories` RENAME TO `expense_categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_unique` ON `expense_categories` (`name`);--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checking_account_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`description` text,
	`amount` real NOT NULL,
	`expense_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`checking_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "checking_account_id", "category_id", "description", "amount", "expense_date", "created_at") SELECT "id", "checking_account_id", "category_id", "description", "amount", "expense_date", "created_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
CREATE TABLE `__new_investments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`investment_account_id` integer NOT NULL,
	`asset_type_id` integer NOT NULL,
	`asset_name` text NOT NULL,
	`amount_invested` real NOT NULL,
	`current_value` real,
	`invested_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`investment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_investments`("id", "investment_account_id", "asset_type_id", "asset_name", "amount_invested", "current_value", "invested_at", "created_at") SELECT "id", "investment_account_id", "asset_type_id", "asset_name", "amount_invested", "current_value", "invested_at", "created_at" FROM `investments`;--> statement-breakpoint
DROP TABLE `investments`;--> statement-breakpoint
ALTER TABLE `__new_investments` RENAME TO `investments`;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`image` text(255),
	`email_verified` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "password", "image", "email_verified", "created_at", "updated_at") SELECT "id", "name", "email", "password", "image", "email_verified", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
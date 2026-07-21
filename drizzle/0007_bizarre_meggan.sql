CREATE TABLE `cdi_rates` (
	`date` text PRIMARY KEY NOT NULL,
	`daily_rate` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dividends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`investment_account_id` integer NOT NULL,
	`asset_name` text NOT NULL,
	`type` text DEFAULT 'RENDIMENTO' NOT NULL,
	`amount` real NOT NULL,
	`payment_date` text NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`source_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`investment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dividends_source_hash_unique` ON `dividends` (`source_hash`);--> statement-breakpoint
CREATE INDEX `dividends_account_asset_idx` ON `dividends` (`investment_account_id`,`asset_name`);--> statement-breakpoint
CREATE TABLE `market_candles` (
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	PRIMARY KEY(`symbol`, `date`)
);
--> statement-breakpoint
CREATE TABLE `market_symbols` (
	`symbol` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'OK' NOT NULL,
	`last_price` real,
	`previous_close` real,
	`last_price_at` integer,
	`candles_from` text,
	`candles_to` text,
	`updated_at` integer
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_investment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`investment_account_id` integer NOT NULL,
	`asset_type_id` integer NOT NULL,
	`asset_name` text NOT NULL,
	`transaction_type` text NOT NULL,
	`quantity` real NOT NULL,
	`price_per_unit` real NOT NULL,
	`total_amount` real NOT NULL,
	`transaction_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`is_fixed_income` integer DEFAULT false,
	`fixed_income_yield_type` text,
	`fixed_income_rate` real,
	`fixed_income_maturity_date` text,
	`source_hash` text,
	FOREIGN KEY (`investment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_investment_transactions`("id", "investment_account_id", "asset_type_id", "asset_name", "transaction_type", "quantity", "price_per_unit", "total_amount", "transaction_date", "created_at", "is_fixed_income", "fixed_income_yield_type", "fixed_income_rate", "fixed_income_maturity_date", "source_hash") SELECT "id", "investment_account_id", "asset_type_id", "asset_name", "transaction_type", "quantity", "price_per_unit", "total_amount", "transaction_date", "created_at", "is_fixed_income", "fixed_income_yield_type", "fixed_income_rate", "fixed_income_maturity_date", NULL FROM `investment_transactions`;--> statement-breakpoint
DROP TABLE `investment_transactions`;--> statement-breakpoint
ALTER TABLE `__new_investment_transactions` RENAME TO `investment_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `investment_transactions_source_hash_unique` ON `investment_transactions` (`source_hash`);
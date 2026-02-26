CREATE TABLE `investment_transactions` (
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
	FOREIGN KEY (`investment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `investments`;
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
	`transaction_date` text DEFAULT CURRENT_TIMESTAMP,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`investment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_investment_transactions`("id", "investment_account_id", "asset_type_id", "asset_name", "transaction_type", "quantity", "price_per_unit", "total_amount", "transaction_date", "created_at") SELECT "id", "investment_account_id", "asset_type_id", "asset_name", "transaction_type", "quantity", "price_per_unit", "total_amount", "transaction_date", "created_at" FROM `investment_transactions`;--> statement-breakpoint
DROP TABLE `investment_transactions`;--> statement-breakpoint
ALTER TABLE `__new_investment_transactions` RENAME TO `investment_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
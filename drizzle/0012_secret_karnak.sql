CREATE TABLE `bank_account_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` integer NOT NULL,
	`provider_account_id` text NOT NULL,
	`account_id` integer NOT NULL,
	`provider_type` text NOT NULL,
	`provider_subtype` text,
	`provider_name` text,
	`last_balance` real,
	`last_synced_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_account_links_provider_account_id_unique` ON `bank_account_links` (`provider_account_id`);--> statement-breakpoint
CREATE TABLE `bank_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'pluggy' NOT NULL,
	`item_id` text NOT NULL,
	`connector_name` text NOT NULL,
	`status` text,
	`consent_expires_at` text,
	`last_synced_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_connections_item_id_unique` ON `bank_connections` (`item_id`);
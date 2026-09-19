CREATE TABLE `reconciliation_decisions` (
	`user_id` text NOT NULL,
	`asset_name` text NOT NULL,
	`decision` text NOT NULL,
	`cause` text NOT NULL,
	`provider_quantity` real,
	`provider_value` real,
	`provider_profit` real,
	`decided_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `asset_name`)
);

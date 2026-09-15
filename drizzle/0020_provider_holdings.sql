CREATE TABLE `provider_holdings` (
	`user_id` text NOT NULL,
	`asset_name` text NOT NULL,
	`quantity` real,
	`value` real,
	`applied` real,
	`profit` real,
	`synced_at` integer,
	PRIMARY KEY(`user_id`, `asset_name`)
);

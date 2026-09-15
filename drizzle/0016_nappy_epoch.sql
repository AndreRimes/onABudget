CREATE TABLE `account_balance_snapshots` (
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`balance` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`account_id`, `date`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `tesouro_prices` (
	`title_key` text NOT NULL,
	`date` text NOT NULL,
	`sell_price` real NOT NULL,
	PRIMARY KEY(`title_key`, `date`)
);
--> statement-breakpoint
ALTER TABLE `investment_transactions` ADD `tesouro_title` text;
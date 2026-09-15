CREATE TABLE `asset_labels` (
	`user_id` text NOT NULL,
	`asset_name` text NOT NULL,
	`label` text NOT NULL,
	`source` text DEFAULT 'PLUGGY_IMPORT' NOT NULL,
	`updated_at` integer,
	PRIMARY KEY(`user_id`, `asset_name`)
);
--> statement-breakpoint
CREATE TABLE `fund_quota_coverage` (
	`cnpj` text NOT NULL,
	`month` text NOT NULL,
	`fetched_at` integer,
	PRIMARY KEY(`cnpj`, `month`)
);
--> statement-breakpoint
CREATE TABLE `fund_quotas` (
	`cnpj` text NOT NULL,
	`date` text NOT NULL,
	`quota` real NOT NULL,
	PRIMARY KEY(`cnpj`, `date`)
);
--> statement-breakpoint
ALTER TABLE `investment_transactions` ADD `fund_cnpj` text;--> statement-breakpoint
-- Backfill: Pluggy stores a fund holding under its CNPJ, so every existing
-- holding whose name *is* a CNPJ already carries the identity the quota series
-- is keyed by. Punctuation is stripped to match the CVM's own key.
UPDATE `investment_transactions`
SET `fund_cnpj` = replace(replace(replace(`asset_name`, '.', ''), '/', ''), '-', '')
WHERE `fund_cnpj` IS NULL
  AND `asset_name` GLOB '[0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]-[0-9][0-9]';

ALTER TABLE `expense_categories` ADD `color` text DEFAULT '#FFFFFF' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `type`;
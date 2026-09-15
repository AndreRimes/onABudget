-- Scope expense_categories and asset_types per user.
--
-- Hand-written rather than left as drizzle-kit generated it: the generated
-- `ALTER TABLE ... ADD user_id text NOT NULL` cannot run against a non-empty
-- table (SQLite rejects a NOT NULL column with no default), and picking one
-- arbitrary owner would hand every existing row to whichever user happens to
-- sort first. Both tables were global, so their rows can legitimately be in
-- use by different people at once.
--
-- The backfill therefore does two things:
--   1. keeps each existing row's id and gives it to the user whose data
--      already references it, so no foreign key from expenses /
--      investment_transactions is broken;
--   2. gives every other user their own copy of each name, so nobody's
--      picklist shrinks just because someone else's row got the original id.
--
-- No foreign_keys pragma here: drizzle's libsql migrator already runs the whole
-- file with `PRAGMA foreign_keys=off` outside the transaction, and a pragma
-- issued inside one is silently ignored — writing it would only look like a
-- guarantee this file does not provide.
CREATE TABLE `__new_asset_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint

-- Owner = whoever has investment transactions of this type; failing that, the
-- oldest account, which is the only defensible guess for an unused row.
INSERT INTO `__new_asset_types` (`id`, `user_id`, `name`, `description`, `created_at`)
SELECT
	`at`.`id`,
	COALESCE(
		(SELECT `a`.`user_id`
		   FROM `investment_transactions` `it`
		   JOIN `accounts` `a` ON `a`.`id` = `it`.`investment_account_id`
		  WHERE `it`.`asset_type_id` = `at`.`id`
		  LIMIT 1),
		(SELECT `id` FROM `user` ORDER BY `created_at`, `id` LIMIT 1)
	),
	`at`.`name`,
	`at`.`description`,
	`at`.`created_at`
FROM `asset_types` `at`;--> statement-breakpoint

-- One copy per remaining user. Reads the old table, so the rows added here
-- cannot feed back into the SELECT; the NOT EXISTS only has to see what step
-- one already inserted.
INSERT INTO `__new_asset_types` (`user_id`, `name`, `description`)
SELECT `u`.`id`, `at`.`name`, `at`.`description`
FROM `asset_types` `at`
CROSS JOIN `user` `u`
WHERE NOT EXISTS (
	SELECT 1 FROM `__new_asset_types` `n`
	 WHERE `n`.`user_id` = `u`.`id` AND `n`.`name` = `at`.`name`
);--> statement-breakpoint

DROP TABLE `asset_types`;--> statement-breakpoint
ALTER TABLE `__new_asset_types` RENAME TO `asset_types`;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_types_user_name_idx` ON `asset_types` (`user_id`,`name`);--> statement-breakpoint

CREATE TABLE `__new_expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#FFFFFF' NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint

-- Owner = whoever has expenses in this category; same fallback as above.
INSERT INTO `__new_expense_categories` (`id`, `user_id`, `name`, `color`, `description`, `created_at`)
SELECT
	`ec`.`id`,
	COALESCE(
		(SELECT `a`.`user_id`
		   FROM `expenses` `e`
		   JOIN `accounts` `a` ON `a`.`id` = `e`.`checking_account_id`
		  WHERE `e`.`category_id` = `ec`.`id`
		  LIMIT 1),
		(SELECT `id` FROM `user` ORDER BY `created_at`, `id` LIMIT 1)
	),
	`ec`.`name`,
	`ec`.`color`,
	`ec`.`description`,
	`ec`.`created_at`
FROM `expense_categories` `ec`;--> statement-breakpoint

INSERT INTO `__new_expense_categories` (`user_id`, `name`, `color`, `description`)
SELECT `u`.`id`, `ec`.`name`, `ec`.`color`, `ec`.`description`
FROM `expense_categories` `ec`
CROSS JOIN `user` `u`
WHERE NOT EXISTS (
	SELECT 1 FROM `__new_expense_categories` `n`
	 WHERE `n`.`user_id` = `u`.`id` AND `n`.`name` = `ec`.`name`
);--> statement-breakpoint

DROP TABLE `expense_categories`;--> statement-breakpoint
ALTER TABLE `__new_expense_categories` RENAME TO `expense_categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_user_name_idx` ON `expense_categories` (`user_id`,`name`);

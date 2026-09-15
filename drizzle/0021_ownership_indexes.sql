CREATE INDEX `budget_user_idx` ON `budget` (`user_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_type_idx` ON `accounts` (`user_id`,`account_type`);--> statement-breakpoint
CREATE INDEX `recurring_expenses_user_idx` ON `recurring_expenses` (`user_id`);--> statement-breakpoint
CREATE INDEX `bank_connections_user_idx` ON `bank_connections` (`user_id`);

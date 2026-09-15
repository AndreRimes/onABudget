CREATE INDEX `bank_account_links_connection_idx` ON `bank_account_links` (`connection_id`);--> statement-breakpoint
CREATE INDEX `dividends_payment_date_idx` ON `dividends` (`payment_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `investment_transactions_account_date_idx` ON `investment_transactions` (`investment_account_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `investment_transactions_asset_idx` ON `investment_transactions` (`asset_name`);
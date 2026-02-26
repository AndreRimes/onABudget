ALTER TABLE `investment_transactions` ADD `is_fixed_income` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `investment_transactions` ADD `fixed_income_yield_type` text;--> statement-breakpoint
ALTER TABLE `investment_transactions` ADD `fixed_income_rate` real;--> statement-breakpoint
ALTER TABLE `investment_transactions` ADD `fixed_income_maturity_date` text;
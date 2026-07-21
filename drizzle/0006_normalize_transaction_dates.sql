-- Custom SQL migration file, put your code below! --

-- Normalize transaction_date to YYYY-MM-DD before it becomes NOT NULL.
-- Rows created via the CURRENT_TIMESTAMP default hold a full timestamp; keep only the date part.
UPDATE `investment_transactions`
SET `transaction_date` = substr(`transaction_date`, 1, 10)
WHERE length(`transaction_date`) > 10;
--> statement-breakpoint
UPDATE `investment_transactions`
SET `transaction_date` = substr(`created_at`, 1, 10)
WHERE `transaction_date` IS NULL OR `transaction_date` = '';

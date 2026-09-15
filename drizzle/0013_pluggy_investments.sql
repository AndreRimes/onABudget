ALTER TABLE `bank_connections` ADD `investment_account_id` integer REFERENCES accounts(id) ON DELETE SET NULL;

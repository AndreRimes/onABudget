-- Custom SQL migration file, put your code below! --

-- Import dedup hashes become private to their owner (see
-- src/server/api/owner-hash.ts). `source_hash` is UNIQUE per table and was
-- derived from the row's content alone, so two users making the same trade on
-- the same day collided: the second import was dropped silently, and the
-- preview told one user whether another already held a row. Every existing
-- hash is rewritten to `{user_id}:{hash}`, with the owner read through the
-- account the row hangs off.
--
-- Recurring occurrences keep their `recurring:{ruleId}:{month}` shape: the
-- rule id is already globally unique, and the materializer does not prefix.
UPDATE `expenses`
SET `source_hash` = (
  SELECT `user_id` FROM `accounts` WHERE `accounts`.`id` = `expenses`.`checking_account_id`
) || ':' || `source_hash`
WHERE `source_hash` IS NOT NULL
  AND `source_hash` NOT LIKE 'recurring:%';--> statement-breakpoint
UPDATE `investment_transactions`
SET `source_hash` = (
  SELECT `user_id` FROM `accounts` WHERE `accounts`.`id` = `investment_transactions`.`investment_account_id`
) || ':' || `source_hash`
WHERE `source_hash` IS NOT NULL;--> statement-breakpoint
UPDATE `dividends`
SET `source_hash` = (
  SELECT `user_id` FROM `accounts` WHERE `accounts`.`id` = `dividends`.`investment_account_id`
) || ':' || `source_hash`
WHERE `source_hash` IS NOT NULL;

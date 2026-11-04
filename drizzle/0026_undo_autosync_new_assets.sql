-- The background sync shipped on 2026-11-04 17:51:51 UTC and, until this
-- release, brought in holdings the ledger did not know by the bank's code —
-- opening positions, movements and reconciliation plugs — even when the owner
-- already kept the same holding under another name (a B3 report's product
-- name, a hand-typed one). That held them twice.
--
-- Undone here: every asset whose rows all came from Pluggy or a plug and none
-- predates the release, with the Pluggy income booked to such assets since.
-- Anything typed by hand or imported from B3 is left alone.
DELETE FROM `dividends`
WHERE `source` = 'PLUGGY_IMPORT'
  AND `created_at` >= '2026-11-04 17:51:51'
  AND `asset_name` NOT IN (
    SELECT `asset_name` FROM `investment_transactions`
    WHERE `created_at` < '2026-11-04 17:51:51'
  )
  AND `asset_name` NOT IN (
    SELECT `asset_name` FROM `dividends`
    WHERE `created_at` < '2026-11-04 17:51:51'
  );
--> statement-breakpoint
DELETE FROM `investment_transactions`
WHERE `asset_name` IN (
  SELECT `asset_name` FROM `investment_transactions`
  GROUP BY `asset_name`
  HAVING MIN(`created_at`) >= '2026-11-04 17:51:51'
    AND SUM(
      CASE
        WHEN `source_hash` LIKE '%:pluggy:%' OR `source_hash` LIKE '%:reconcile:%'
        THEN 0 ELSE 1
      END
    ) = 0
);

-- Custom SQL migration file, put your code below! --

-- Categories created by a statement import all landed on one slate hex, so the
-- donut drew every imported category in the same colour and their badges were
-- indistinguishable. Spread the existing ones over the palette in
-- `~/lib/category-colors`: one colour each, in id order, per owner.
--
-- The count starts at the eighth entry because the first seven are exactly the
-- hues `seedDefaultsForUser` hands the starter categories — an owner with more
-- than seven imported categories wraps back onto them, which is the palette
-- running out rather than a default being reused.
--
-- `Outros` is seeded with this same slate on purpose, so it keeps it.
WITH ranked AS (
  SELECT
    `id`,
    (ROW_NUMBER() OVER (PARTITION BY `user_id` ORDER BY `id`) - 1 + 7) % 14 AS `slot`
  FROM `expense_categories`
  WHERE `color` = '#64748B' AND `name` <> 'Outros'
)
UPDATE `expense_categories`
SET `color` = CASE (SELECT `slot` FROM ranked WHERE ranked.`id` = `expense_categories`.`id`)
  WHEN 0 THEN '#F97316'
  WHEN 1 THEN '#0EA5E9'
  WHEN 2 THEN '#8B5CF6'
  WHEN 3 THEN '#EF4444'
  WHEN 4 THEN '#14B8A6'
  WHEN 5 THEN '#EC4899'
  WHEN 6 THEN '#6366F1'
  WHEN 7 THEN '#65A30D'
  WHEN 8 THEN '#F59E0B'
  WHEN 9 THEN '#06B6D4'
  WHEN 10 THEN '#D946EF'
  WHEN 11 THEN '#A16207'
  WHEN 12 THEN '#059669'
  ELSE '#BE123C'
END
WHERE `id` IN (SELECT `id` FROM ranked);

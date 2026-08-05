// Guessing the category of an imported statement row from the user's own past
// choices. No external service and no cost: the signal is entirely the
// expenses they already categorized, plus the explicit corrections recorded in
// `expense_category_rules` during previous imports.
import { and, eq } from "drizzle-orm";
import { normalizeMerchant } from "~/lib/merchant";
import { db } from "~/server/db";
import {
  accounts,
  expenseCategoryRules,
  expenseIgnoreRules,
  expenses,
} from "~/server/db/schema";

export type SuggestionSource = "rule" | "history" | null;

export interface CategorySuggestion {
  categoryId: number | null;
  source: SuggestionSource;
}

/**
 * Everything needed to categorize a batch of descriptions, loaded once so a
 * 5000-row import does not issue 5000 queries.
 */
export async function loadCategorizer(userId: string) {
  const [rules, history, ignoreRules] = await Promise.all([
    db
      .select({
        pattern: expenseCategoryRules.pattern,
        categoryId: expenseCategoryRules.categoryId,
      })
      .from(expenseCategoryRules)
      .where(eq(expenseCategoryRules.userId, userId)),
    db
      .select({
        description: expenses.description,
        categoryId: expenses.categoryId,
      })
      .from(expenses)
      .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
      .where(eq(accounts.userId, userId)),
    db
      .select({ pattern: expenseIgnoreRules.pattern })
      .from(expenseIgnoreRules)
      .where(eq(expenseIgnoreRules.userId, userId)),
  ]);

  const ignored = new Set(ignoreRules.map((rule) => rule.pattern));

  const ruleMap = new Map(rules.map((rule) => [rule.pattern, rule.categoryId]));

  // Votes for the exact merchant key, and separately for just its leading
  // token. The second map is what lets a brand generalize: after a couple of
  // "IFOOD <restaurant>" rows land in Alimentação, a brand-new
  // "IFOOD <other restaurant>" is still recognised as IFOOD.
  const exactVotes = new Map<string, Map<number, number>>();
  const headVotes = new Map<string, Map<number, number>>();

  const addVote = (
    votes: Map<string, Map<number, number>>,
    key: string,
    categoryId: number,
  ) => {
    const byCategory = votes.get(key) ?? new Map<number, number>();
    byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + 1);
    votes.set(key, byCategory);
  };

  for (const row of history) {
    const key = normalizeMerchant(row.description);
    if (!key) continue;
    addVote(exactVotes, key, row.categoryId);
    addVote(headVotes, key.split(" ")[0]!, row.categoryId);
  }
  // Explicit corrections also inform the brand-level guess.
  for (const rule of rules) {
    addVote(headVotes, rule.pattern.split(" ")[0]!, rule.categoryId);
  }

  const winners = (votes: Map<string, Map<number, number>>) => {
    const result = new Map<string, number>();
    for (const [key, byCategory] of votes) {
      let best: { categoryId: number; count: number } | null = null;
      for (const [categoryId, count] of byCategory) {
        if (!best || count > best.count) best = { categoryId, count };
      }
      if (best) result.set(key, best.categoryId);
    }
    return result;
  };

  const historyMap = winners(exactVotes);
  const headMap = winners(headVotes);

  return {
    /**
     * True when the user has previously marked this merchant as "not an
     * expense" — a transfer between their own accounts, an investment
     * application, the card bill.
     */
    isIgnored(description: string | null): boolean {
      const key = normalizeMerchant(description);
      return key ? ignored.has(key) : false;
    },

    /** Explicit past corrections win over inferred history. */
    suggest(description: string | null): CategorySuggestion {
      const key = normalizeMerchant(description);
      if (!key) return { categoryId: null, source: null };

      const fromRule = ruleMap.get(key);
      if (fromRule !== undefined) {
        return { categoryId: fromRule, source: "rule" };
      }

      const fromHistory = historyMap.get(key);
      if (fromHistory !== undefined) {
        return { categoryId: fromHistory, source: "history" };
      }

      // Nothing matched the whole key — fall back to the brand.
      const fromHead = headMap.get(key.split(" ")[0]!);
      if (fromHead !== undefined) {
        return { categoryId: fromHead, source: "history" };
      }

      return { categoryId: null, source: null };
    },
  };
}

/**
 * Records the categories chosen during an import so the next one already knows
 * them. Called with whatever the user confirmed in the preview — including
 * unchanged suggestions, which is what turns a one-off guess into a rule.
 */
export async function rememberCategories(
  userId: string,
  pairs: Array<{ description: string | null; categoryId: number }>,
) {
  const byPattern = new Map<string, number>();
  for (const pair of pairs) {
    const key = normalizeMerchant(pair.description);
    if (key) byPattern.set(key, pair.categoryId);
  }
  if (byPattern.size === 0) return;

  for (const [pattern, categoryId] of byPattern) {
    await db
      .insert(expenseCategoryRules)
      .values({ userId, pattern, categoryId })
      .onConflictDoUpdate({
        target: [expenseCategoryRules.userId, expenseCategoryRules.pattern],
        set: { categoryId },
      });
    // A merchant can't be both a category and "not an expense"; the newer
    // decision wins.
    await db
      .delete(expenseIgnoreRules)
      .where(
        and(
          eq(expenseIgnoreRules.userId, userId),
          eq(expenseIgnoreRules.pattern, pattern),
        ),
      );
  }
}

/**
 * Records merchants the user marked as "not an expense" during an import, so
 * future imports skip them without asking again.
 */
export async function rememberIgnored(
  userId: string,
  descriptions: Array<string | null>,
) {
  const patterns = new Set(
    descriptions.map(normalizeMerchant).filter((key) => key !== ""),
  );
  for (const pattern of patterns) {
    await db
      .insert(expenseIgnoreRules)
      .values({ userId, pattern })
      .onConflictDoNothing({
        target: [expenseIgnoreRules.userId, expenseIgnoreRules.pattern],
      });
  }
}

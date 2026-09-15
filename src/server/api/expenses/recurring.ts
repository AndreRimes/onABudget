// Fixed monthly expenses (rent, streaming, gym): a template table plus a
// materializer that turns due occurrences into real `expenses` rows.
//
// Materialization is idempotent — each occurrence gets the source hash
// `recurring:{ruleId}:{YYYY-MM}`, which is UNIQUE on `expenses` — so it is safe
// to run on every page load without tracking what was already posted.
import { and, asc, eq, inArray } from "drizzle-orm";
import { chunk } from "~/lib/chunk";
import { db } from "~/server/db";
import { expenses, recurringExpenses } from "~/server/db/schema";
import { dueOccurrences } from "./recurring-schedule";

/** Rows per statement — see the note in `chunk`. */
const INSERT_CHUNK_SIZE = 200;

export type RecurringInput = {
  checkingAccountId: number;
  categoryId: number;
  description: string;
  amount: number;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth?: string | null;
  active?: boolean;
};

export function listRecurring(userId: string) {
  return db
    .select()
    .from(recurringExpenses)
    .where(eq(recurringExpenses.userId, userId))
    .orderBy(asc(recurringExpenses.dayOfMonth));
}

export function createRecurring(userId: string, input: RecurringInput) {
  return db
    .insert(recurringExpenses)
    .values({ userId, ...input })
    .returning();
}

export function updateRecurring(
  userId: string,
  id: number,
  input: Partial<RecurringInput>,
) {
  return db
    .update(recurringExpenses)
    .set(input)
    .where(
      and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
    )
    .returning();
}

export function deleteRecurring(userId: string, id: number) {
  return db
    .delete(recurringExpenses)
    .where(
      and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
    );
}

export async function ownsRecurring(userId: string, id: number) {
  const [row] = await db
    .select({ id: recurringExpenses.id })
    .from(recurringExpenses)
    .where(
      and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
    );
  return row !== undefined;
}

/**
 * Posts every occurrence that is due (start month through today) and not
 * already present. Returns how many rows were actually created — the caller
 * only tells the user when that is non-zero.
 */
export async function materializeRecurring(
  userId: string,
  today = new Date(),
): Promise<{ created: number }> {
  const rules = await db
    .select()
    .from(recurringExpenses)
    .where(
      and(
        eq(recurringExpenses.userId, userId),
        eq(recurringExpenses.active, true),
      ),
    );
  if (rules.length === 0) return { created: 0 };

  const todayIso = today.toISOString().slice(0, 10);

  const pending = rules.flatMap((rule) =>
    dueOccurrences(rule, todayIso).map((occurrence) => ({ rule, occurrence })),
  );

  if (pending.length === 0) return { created: 0 };

  // This runs on every visit to Conta Corrente, and `dueOccurrences` emits
  // every month since each rule started — so nearly all of `pending` already
  // exists. One read finds the ones that do, and only the rest are written,
  // in batches, instead of one no-op INSERT per rule per month per visit.
  const existing = new Set<string>();
  for (const batch of chunk(
    pending.map(({ occurrence }) => occurrence.hash),
    INSERT_CHUNK_SIZE,
  )) {
    const rows = await db
      .select({ sourceHash: expenses.sourceHash })
      .from(expenses)
      .where(inArray(expenses.sourceHash, batch));
    for (const row of rows) if (row.sourceHash) existing.add(row.sourceHash);
  }

  const missing = pending.filter(
    ({ occurrence }) => !existing.has(occurrence.hash),
  );
  if (missing.length === 0) return { created: 0 };

  let created = 0;
  await db.transaction(async (tx) => {
    for (const batch of chunk(missing, INSERT_CHUNK_SIZE)) {
      const result = await tx
        .insert(expenses)
        .values(
          batch.map(({ rule, occurrence }) => ({
            checkingAccountId: rule.checkingAccountId,
            categoryId: rule.categoryId,
            description: rule.description,
            amount: rule.amount,
            expenseDate: occurrence.date,
            source: "RECURRING" as const,
            sourceHash: occurrence.hash,
          })),
        )
        // Still guarded: a concurrent visit may have written the same month
        // between the read above and this write.
        .onConflictDoNothing({ target: expenses.sourceHash })
        .returning({ id: expenses.id });
      created += result.length;
    }
  });

  return { created };
}

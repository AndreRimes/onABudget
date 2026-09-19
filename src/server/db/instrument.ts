import type {
  Client,
  InArgs,
  InStatement,
  TransactionMode,
} from "@libsql/client";

import {
  dbQueriesInFlight,
  dbQueryDuration,
  dbQueryErrors,
} from "../metrics/instruments";

/**
 * Timing for every statement the app runs.
 *
 * Drizzle's own `logger` option is not usable for this: its `Logger` interface
 * is `logQuery(query, params)`, called *before* execution, so it can report a
 * query count but never a duration or an error. Proxying the libSQL client
 * instead gives real wall-clock timings and covers Drizzle queries, the
 * better-auth adapter (same client) and any raw `client.execute`.
 *
 * Known gap: statements issued inside `client.transaction()` are not seen.
 * The importers (statement, B3, Pluggy investments) and the recurring-expense
 * poster all write inside one, so their per-row writes are invisible here —
 * only the procedure-level histogram in ~/server/api/trpc.ts times them.
 */

/**
 * Every table in the schema, so `table` can never take an unbounded value.
 * Keep in step with ~/server/db/schema.ts: a table missing here is bucketed
 * as "other", which is where the market-cache reads hid until this was
 * brought up to date.
 */
const TABLES = new Set([
  "account",
  "account_balance_snapshots",
  "accounts",
  "asset_labels",
  "asset_types",
  "bank_account_links",
  "bank_connections",
  "benchmark_points",
  "benchmark_sync",
  "budget",
  "cdi_rates",
  "dividends",
  "expense_categories",
  "expense_category_rules",
  "expense_ignore_rules",
  "expenses",
  "fund_quota_coverage",
  "fund_quotas",
  "investment_transactions",
  "market_candles",
  "market_symbols",
  "provider_holdings",
  "recurring_expenses",
  "session",
  "tesouro_prices",
  "user",
  "verification",
]);

const OPERATIONS = new Set(["select", "insert", "update", "delete", "pragma"]);

const UNKNOWN = { operation: "other", table: "other" } as const;

/**
 * Cardinality-safe labels derived from the SQL. The statement text itself is
 * never used as a label value.
 */
/** The statement forms `execute`/`batch` accept: an object, a string, or a [sql, args] tuple. */
type StatementLike = InStatement | [string, InArgs?];

function statementText(stmt: StatementLike): string {
  if (typeof stmt === "string") return stmt;
  if (Array.isArray(stmt)) return stmt[0];
  return stmt.sql;
}

function labelsFor(stmt: StatementLike): { operation: string; table: string } {
  const sql = statementText(stmt).trimStart();

  const first = /^[a-z]+/i.exec(sql)?.[0]?.toLowerCase() ?? "";
  const operation = OPERATIONS.has(first) ? first : "other";

  const candidate = /(?:from|into|update|table)\s+["`']?([a-z_]+)/i
    .exec(sql)?.[1]
    ?.toLowerCase();

  return {
    operation,
    table: candidate && TABLES.has(candidate) ? candidate : "other",
  };
}

async function timed<T>(
  labels: { operation: string; table: string },
  run: () => Promise<T>,
): Promise<T> {
  const stop = dbQueryDuration.startTimer(labels);
  dbQueriesInFlight.inc();
  try {
    return await run();
  } catch (error) {
    dbQueryErrors.inc(labels);
    throw error;
  } finally {
    stop();
    dbQueriesInFlight.dec();
  }
}

export function instrumentClient(client: Client): Client {
  return new Proxy(client, {
    get(target, prop) {
      // Both methods are overloaded (`execute(stmt)` / `execute(sql, args)`),
      // which a typed spread cannot forward; the wrappers take the widest form
      // and hand the call through untouched.
      if (prop === "execute") {
        const execute = (stmt: InStatement | string, args?: InArgs) =>
          timed(labelsFor(stmt), () =>
            typeof stmt === "string"
              ? target.execute(stmt, args)
              : target.execute(stmt),
          );
        return execute;
      }

      if (prop === "batch") {
        const batch = (stmts: StatementLike[], mode?: TransactionMode) =>
          timed(
            // A batch runs as one transaction; attribute it to its first statement.
            stmts.length > 0 ? labelsFor(stmts[0]!) : UNKNOWN,
            () => target.batch(stmts, mode),
          );
        return batch;
      }

      // Read against `target`, not the proxy — routing a getter back through
      // the receiver would recurse into this trap.
      const value: unknown = Reflect.get(target, prop, target);
      // Binding is load-bearing: libSQL's methods rely on `this`, and handing
      // them out unbound through the proxy breaks transaction()/close().
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

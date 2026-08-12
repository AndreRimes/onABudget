import type { Client, InStatement } from "@libsql/client";

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
 * Known gap: statements issued inside `client.transaction()` are not seen. The
 * app uses no transactions today, so coverage is complete in practice.
 */

/** The 14 real tables, so `table` can never take an unbounded value. */
const TABLES = new Set([
  "budget",
  "accounts",
  "asset_types",
  "expense_categories",
  "expenses",
  "investment_transactions",
  "dividends",
  "market_symbols",
  "market_candles",
  "cdi_rates",
  "user",
  "session",
  "account",
  "verification",
]);

const OPERATIONS = new Set(["select", "insert", "update", "delete", "pragma"]);

const UNKNOWN = { operation: "other", table: "other" } as const;

/**
 * Cardinality-safe labels derived from the SQL. The statement text itself is
 * never used as a label value.
 */
function labelsFor(stmt: InStatement): { operation: string; table: string } {
  const sql = (typeof stmt === "string" ? stmt : stmt.sql).trimStart();

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

type Execute = Client["execute"];
type Batch = Client["batch"];

export function instrumentClient(client: Client): Client {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "execute") {
        const execute: Execute = (...args) =>
          timed(labelsFor(args[0]), () => target.execute(...args));
        return execute;
      }

      if (prop === "batch") {
        const batch: Batch = (...args) =>
          timed(
            // A batch runs as one transaction; attribute it to its first statement.
            args[0].length > 0 ? labelsFor(args[0][0]!) : UNKNOWN,
            () => target.batch(...args),
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

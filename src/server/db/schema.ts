import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const budget = sqliteTable(
  "budget",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amount: real("amount").notNull().default(0),
    startPeriod: text("start_period")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    endPeriod: text("end_period"),
    userId: text("user_id").notNull(),
  },
  (table) => [index("budget_user_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // CREDIT_CARD holds card purchases imported from a fatura. It is a spending
    // account like CHECKING (expenses hang off it), not an investment one.
    accountType: text("account_type", {
      enum: ["CHECKING", "INVESTMENT", "CREDIT_CARD"],
    }).notNull(),
    balance: real("balance").notNull().default(0),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  // Nearly every query in the app is scoped by joining through this table on
  // `user_id`; without an index that join was a full scan of it, every time.
  // The type rides along for the "spending accounts" / "checking only" reads.
  (table) => [
    index("accounts_user_type_idx").on(table.userId, table.accountType),
  ],
);

/**
 * Owned per user, like every other domain table. The name is unique *within*
 * an owner rather than globally: two people may both keep an "Ações", and the
 * global unique this table used to carry meant the second one to sign up
 * silently inherited (and could rename or delete) the first one's list.
 */
export const assetTypes = sqliteTable(
  "asset_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("asset_types_user_name_idx").on(table.userId, table.name),
  ],
);

/** Owned per user, same contract as {@link assetTypes}. */
export const expenseCategories = sqliteTable(
  "expense_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#FFFFFF"),
    description: text("description"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("expense_categories_user_name_idx").on(
      table.userId,
      table.name,
    ),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkingAccountId: integer("checking_account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    description: text("description"),
    amount: real("amount").notNull(),
    expenseDate: text("expense_date").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    // How the row got here. MANUAL rows are typed by hand and have no hash;
    // IMPORT and RECURRING rows are machine-generated and always carry one.
    source: text("source", { enum: ["MANUAL", "IMPORT", "RECURRING"] })
      .notNull()
      .default("MANUAL"),
    // Dedup key, same contract as investmentTransactions.sourceHash: unique so
    // re-importing an overlapping statement (or reloading the page with a
    // recurring rule due) is a no-op. NULL for manual entries — SQLite allows
    // any number of NULLs in a unique index.
    sourceHash: text("source_hash").unique(),
  },
  (table) => [
    index("expenses_category_idx").on(table.categoryId),
    index("expenses_account_date_idx").on(
      table.checkingAccountId,
      table.expenseDate,
    ),
  ],
);

// Templates for fixed monthly expenses (rent, streaming, gym). Materialized
// into real `expenses` rows by materializeRecurring(), which is idempotent via
// a `recurring:{ruleId}:{YYYY-MM}` source hash.
export const recurringExpenses = sqliteTable(
  "recurring_expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    checkingAccountId: integer("checking_account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    description: text("description").notNull(),
    amount: real("amount").notNull(),
    dayOfMonth: integer("day_of_month").notNull(), // 1-31, clamped to month length
    startMonth: text("start_month").notNull(), // YYYY-MM, first month to post
    endMonth: text("end_month"), // YYYY-MM inclusive, null = open-ended
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  // Read on every visit to Conta Corrente, by owner.
  (table) => [index("recurring_expenses_user_idx").on(table.userId)],
);

// Merchants the user marked as "not an expense" during an import: paying the
// credit-card bill, moving money between their own accounts, buying an
// investment. Kept separate from expenseCategoryRules so that table's
// categoryId can stay NOT NULL.
export const expenseIgnoreRules = sqliteTable(
  "expense_ignore_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    pattern: text("pattern").notNull(), // output of normalizeMerchant()
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("expense_ignore_rules_user_pattern_idx").on(
      table.userId,
      table.pattern,
    ),
  ],
);

// Learned merchant -> category mappings. Written whenever the user picks a
// category during a statement import, so the next import already knows it.
export const expenseCategoryRules = sqliteTable(
  "expense_category_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    pattern: text("pattern").notNull(), // output of normalizeMerchant()
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("expense_category_rules_user_pattern_idx").on(
      table.userId,
      table.pattern,
    ),
  ],
);

export const investmentTransactions = sqliteTable(
  "investment_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investmentAccountId: integer("investment_account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),
    assetTypeId: integer("asset_type_id")
      .notNull()
      .references(() => assetTypes.id),
    assetName: text("asset_name").notNull(),
    transactionType: text("transaction_type", {
      enum: ["BUY", "SELL"],
    }).notNull(),
    quantity: real("quantity").notNull(),
    pricePerUnit: real("price_per_unit").notNull(),
    totalAmount: real("total_amount").notNull(),
    transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    // Fixed income fields
    isFixedIncome: integer("is_fixed_income", { mode: "boolean" }).default(
      false,
    ),
    fixedIncomeYieldType: text("fixed_income_yield_type", {
      enum: ["CDI_PERCENTAGE", "PREFIXED"],
    }),
    fixedIncomeRate: real("fixed_income_rate"), // e.g. 100 for 100% CDI, or 15 for 15% aa
    fixedIncomeMaturityDate: text("fixed_income_maturity_date"),
    // Canonical Tesouro Direto title (e.g. "TESOURO IPCA+ 2050"). When set, the
    // holding is marked to market from official daily PU instead of accruing.
    // Kept independent of assetName so a rename can't break Tesouro pricing.
    tesouroTitle: text("tesouro_title"),
    // CNPJ (14 digits, unpunctuated) of the fund this holding is a share of.
    // When set, the holding is marked to market from the CVM's daily quota
    // series. Kept independent of assetName for the same reason tesouroTitle
    // is: the name is a label the user may change, the CNPJ is the identity
    // the price source is keyed by.
    fundCnpj: text("fund_cnpj"),
    sourceHash: text("source_hash").unique(), // B3 import dedup key
  },
  (table) => [
    // The portfolio engine replays this table in date order for one user's
    // accounts on every snapshot — the single hottest read in the app, and a
    // full scan without this.
    index("investment_transactions_account_date_idx").on(
      table.investmentAccountId,
      table.transactionDate,
    ),
    // The per-asset detail page, and the "which type is this asset" lookups
    // the importers do before every insert.
    index("investment_transactions_asset_idx").on(table.assetName),
  ],
);

export const dividends = sqliteTable(
  "dividends",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    investmentAccountId: integer("investment_account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),
    assetName: text("asset_name").notNull(),
    type: text("type", {
      enum: ["DIVIDEND", "JCP", "RENDIMENTO"],
    })
      .notNull()
      .default("RENDIMENTO"),
    amount: real("amount").notNull(), // total net BRL received
    paymentDate: text("payment_date").notNull(), // YYYY-MM-DD
    source: text("source", { enum: ["MANUAL", "B3_IMPORT", "PLUGGY_IMPORT"] })
      .notNull()
      .default("MANUAL"),
    sourceHash: text("source_hash").unique(), // B3 import dedup key
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("dividends_account_asset_idx").on(
      table.investmentAccountId,
      table.assetName,
    ),
    // Dividend windows (12 months, last 3 months) are date-ranged, not asset-
    // ranged, so the composite above does not serve them.
    index("dividends_payment_date_idx").on(table.paymentDate),
  ],
);

// Quote cache + negative cache + candle-coverage metadata, one row per ticker
export const marketSymbols = sqliteTable("market_symbols", {
  symbol: text("symbol").primaryKey(),
  status: text("status", { enum: ["OK", "NOT_FOUND"] })
    .notNull()
    .default("OK"),
  lastPrice: real("last_price"),
  previousClose: real("previous_close"),
  lastPriceAt: integer("last_price_at", { mode: "timestamp_ms" }),
  candlesFrom: text("candles_from"), // YYYY-MM-DD, candle coverage start
  candlesTo: text("candles_to"), // YYYY-MM-DD, candle coverage end
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

// Immutable daily closes — cached forever
export const marketCandles = sqliteTable(
  "market_candles",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    close: real("close").notNull(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

// BCB SGS series 12 daily CDI rates (business days only) — cached forever
export const cdiRates = sqliteTable("cdi_rates", {
  date: text("date").primaryKey(), // YYYY-MM-DD
  dailyRate: real("daily_rate").notNull(), // decimal, e.g. 0.00051
});

// Daily returns for the comparison benchmarks (Ibovespa, IPCA, poupança),
// normalised to one decimal return per calendar date whatever the upstream
// shape was — an index price series and a monthly inflation print both land
// here as "what one day was worth". CDI is NOT stored here: it predates this
// table and already has full history in `cdi_rates`, so it keeps that path.
export const benchmarkPoints = sqliteTable(
  "benchmark_points",
  {
    benchmarkId: text("benchmark_id").notNull(), // e.g. "IBOV"
    date: text("date").notNull(), // YYYY-MM-DD
    dailyReturn: real("daily_return").notNull(), // decimal, e.g. 0.0031
  },
  (table) => [primaryKey({ columns: [table.benchmarkId, table.date] })],
);

// Per-benchmark cache coverage, so a refetch only asks for the missing edges.
export const benchmarkSync = sqliteTable("benchmark_sync", {
  benchmarkId: text("benchmark_id").primaryKey(),
  coversFrom: text("covers_from").notNull(), // YYYY-MM-DD
  coversTo: text("covers_to").notNull(), // YYYY-MM-DD
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

// Official Tesouro Direto daily resale prices (PU Venda Manhã) — cached forever
export const tesouroPrices = sqliteTable(
  "tesouro_prices",
  {
    titleKey: text("title_key").notNull(), // e.g. "TESOURO IPCA+ 2050"
    date: text("date").notNull(), // YYYY-MM-DD
    sellPrice: real("sell_price").notNull(),
  },
  (table) => [primaryKey({ columns: [table.titleKey, table.date] })],
);

/**
 * Daily quota values (VL_QUOTA) from the CVM's "informe diário", the official
 * price series for Brazilian funds — the equivalent of `tesouro_prices` for
 * anything held by CNPJ. Cached forever: a published quota never changes.
 */
export const fundQuotas = sqliteTable(
  "fund_quotas",
  {
    cnpj: text("cnpj").notNull(), // 14 digits, no punctuation
    date: text("date").notNull(), // YYYY-MM-DD
    quota: real("quota").notNull(),
  },
  (table) => [primaryKey({ columns: [table.cnpj, table.date] })],
);

/**
 * Which (fund, month) pairs have already been read out of a CVM monthly file.
 *
 * Coverage is tracked per fund and not per month because one file carries every
 * fund in the country and only the requested CNPJs are kept from it: a fund
 * bought later must still be able to backfill a month an earlier fund already
 * consumed.
 */
export const fundQuotaCoverage = sqliteTable(
  "fund_quota_coverage",
  {
    cnpj: text("cnpj").notNull(),
    month: text("month").notNull(), // YYYY-MM
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
  },
  (table) => [primaryKey({ columns: [table.cnpj, table.month] })],
);

/**
 * What the provider knows about an asset that the ledger does not carry.
 *
 * Chiefly its human-readable name: the ledger key is a code — a fund's CNPJ, a
 * CDB's issuer code — because the code is the identity (two CDBs from the same
 * bank share a name but never a code), so the readable name has to live beside
 * it as a label the UI prints.
 */
export const assetLabels = sqliteTable(
  "asset_labels",
  {
    userId: text("user_id").notNull(),
    assetName: text("asset_name").notNull(),
    label: text("label").notNull(),
    source: text("source", { enum: ["PLUGGY_IMPORT", "MANUAL"] })
      .notNull()
      .default("PLUGGY_IMPORT"),
    /**
     * Quota value the provider reported for this holding, and the day it was
     * reported. Not a price source — it is the reference that says *which*
     * subclass of a fund the holding is in when one CNPJ publishes several.
     */
    providerQuota: real("provider_quota"),
    providerQuotaDate: text("provider_quota_date"), // YYYY-MM-DD
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.assetName] })],
);

/**
 * The position the provider last reported for a holding, as it reported it.
 *
 * Kept beside the ledger, never mixed into it: these are the bank's numbers,
 * and the whole point is to have something independent to check the ledger
 * against. The ledger says what was bought and sold; this says what the bank
 * believes is there now, and the two disagreeing is a finding — a purchase
 * older than the connector's history window, a quota priced on a different
 * day — rather than something to reconcile away silently.
 *
 * One row per asset per owner, overwritten on every sync.
 */
export const providerHoldings = sqliteTable(
  "provider_holdings",
  {
    userId: text("user_id").notNull(),
    assetName: text("asset_name").notNull(),
    /** Quotas/shares held, per the provider. */
    quantity: real("quantity"),
    /** Current value of the position, per the provider. */
    value: real("value"),
    /** Amount originally applied, when the connector reports one. */
    applied: real("applied"),
    /** Profit on the position, per the provider. */
    profit: real("profit"),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.assetName] })],
);

/**
 * What the owner decided about one disagreement between the ledger and the
 * bank, when that decision has to outlive the next recalculation.
 *
 * Two of the possible resolutions do not touch the ledger and so need a place
 * of their own: keeping the app's figure ("app"), and valuing the holding at
 * the unit price the bank reported ("bank_price"). The other two — an
 * adjusting trade, a rescaled cost — write to the ledger and leave no row here.
 *
 * Each row carries the bank's figures as they were when the decision was
 * taken. A later sync that reports different numbers makes the decision lapse
 * and the mismatch comes back: accepting one disagreement is not accepting
 * every future one.
 */
export const reconciliationDecisions = sqliteTable(
  "reconciliation_decisions",
  {
    userId: text("user_id").notNull(),
    assetName: text("asset_name").notNull(),
    decision: text("decision", { enum: ["app", "bank_price"] }).notNull(),
    /** The cause the entry had when decided, for the UI to name it. */
    cause: text("cause").notNull(),
    providerQuantity: real("provider_quantity"),
    providerValue: real("provider_value"),
    providerProfit: real("provider_profit"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.assetName] })],
);

/**
 * One consented Open Finance connection (a Pluggy "item"), i.e. one bank the
 * owner linked at meu.pluggy.ai. Owned by a user id like every other domain
 * table, even though the free tier means there is only ever one owner.
 */
export const bankConnections = sqliteTable(
  "bank_connections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: ["pluggy"] })
      .notNull()
      .default("pluggy"),
    // The provider's item id. Unique so re-listing connections upserts instead
    // of duplicating them on every refresh.
    itemId: text("item_id").notNull().unique(),
    connectorName: text("connector_name").notNull(),
    status: text("status"),
    // Surfaced in the UI: an Open Finance consent lasts up to 12 months and has
    // to be renewed at meu.pluggy.ai, which would otherwise fail silently.
    consentExpiresAt: text("consent_expires_at"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    // Investment products belong to an item, not to a Pluggy BANK/CREDIT
    // account. One local investment account is therefore chosen per connection.
    investmentAccountId: integer("investment_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("bank_connections_user_idx").on(table.userId)],
);

/**
 * Maps one provider account onto one local account. This is what makes syncing
 * idempotent at the account level: `accounts` has no external id and no unique
 * constraint, so without this table every sync would create fresh accounts.
 */
export const bankAccountLinks = sqliteTable(
  "bank_account_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    connectionId: integer("connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull().unique(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerType: text("provider_type", { enum: ["BANK", "CREDIT"] }).notNull(),
    providerSubtype: text("provider_subtype"),
    providerName: text("provider_name"),
    lastBalance: real("last_balance"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bank_account_links_connection_idx").on(table.connectionId),
  ],
);

/**
 * Daily closing balance per account, so net worth can be plotted over time.
 *
 * `accounts.balance` is a current value with no history, and none can be
 * reconstructed: there is no income ledger to walk backwards through. So this
 * accumulates going forward instead of being back-filled with guesses — the
 * chart starts the day the first snapshot is written and grows from there.
 *
 * One row per account per day: the primary key makes a repeated write on the
 * same day a no-op, whatever triggers it.
 */
export const accountBalanceSnapshots = sqliteTable(
  "account_balance_snapshots",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    balance: real("balance").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const investmentTransactionsRelations = relations(
  investmentTransactions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [investmentTransactions.investmentAccountId],
      references: [accounts.id],
    }),
    assetType: one(assetTypes, {
      fields: [investmentTransactions.assetTypeId],
      references: [assetTypes.id],
    }),
  }),
);

export const dividendsRelations = relations(dividends, ({ one }) => ({
  account: one(accounts, {
    fields: [dividends.investmentAccountId],
    references: [accounts.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  expenses: many(expenses),
  investmentTransactions: many(investmentTransactions),
  dividends: many(dividends),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  account: one(accounts, {
    fields: [expenses.checkingAccountId],
    references: [accounts.id],
  }),
  category: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
}));

export const expenseCategoriesRelations = relations(
  expenseCategories,
  ({ many }) => ({
    expenses: many(expenses),
    recurringExpenses: many(recurringExpenses),
  }),
);

export const recurringExpensesRelations = relations(
  recurringExpenses,
  ({ one }) => ({
    account: one(accounts, {
      fields: [recurringExpenses.checkingAccountId],
      references: [accounts.id],
    }),
    category: one(expenseCategories, {
      fields: [recurringExpenses.categoryId],
      references: [expenseCategories.id],
    }),
  }),
);

export const assetTypesRelations = relations(assetTypes, ({ many }) => ({
  investmentTransactions: many(investmentTransactions),
}));

export const bankConnectionsRelations = relations(
  bankConnections,
  ({ many }) => ({
    accountLinks: many(bankAccountLinks),
  }),
);

export const bankAccountLinksRelations = relations(
  bankAccountLinks,
  ({ one }) => ({
    connection: one(bankConnections, {
      fields: [bankAccountLinks.connectionId],
      references: [bankConnections.id],
    }),
    account: one(accounts, {
      fields: [bankAccountLinks.accountId],
      references: [accounts.id],
    }),
  }),
);

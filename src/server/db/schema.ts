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

export const budget = sqliteTable("budget", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: real("amount").notNull().default(0),
  startPeriod: text("start_period")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  endPeriod: text("end_period"),
  userId: text("user_id").notNull(),
});

export const accounts = sqliteTable("accounts", {
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
});

export const assetTypes = sqliteTable("asset_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const expenseCategories = sqliteTable("expense_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#FFFFFF"),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

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
    index("expenses_account_date_idx").on(
      table.checkingAccountId,
      table.expenseDate,
    ),
  ],
);

// Templates for fixed monthly expenses (rent, streaming, gym). Materialized
// into real `expenses` rows by materializeRecurring(), which is idempotent via
// a `recurring:{ruleId}:{YYYY-MM}` source hash.
export const recurringExpenses = sqliteTable("recurring_expenses", {
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
});

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

export const investmentTransactions = sqliteTable("investment_transactions", {
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
  isFixedIncome: integer("is_fixed_income", { mode: "boolean" }).default(false),
  fixedIncomeYieldType: text("fixed_income_yield_type", {
    enum: ["CDI_PERCENTAGE", "PREFIXED"],
  }),
  fixedIncomeRate: real("fixed_income_rate"), // e.g. 100 for 100% CDI, or 15 for 15% aa
  fixedIncomeMaturityDate: text("fixed_income_maturity_date"),
  // Canonical Tesouro Direto title (e.g. "TESOURO IPCA+ 2050"). When set, the
  // holding is marked to market from official daily PU instead of accruing.
  // Kept independent of assetName so a rename can't break Tesouro pricing.
  tesouroTitle: text("tesouro_title"),
  sourceHash: text("source_hash").unique(), // B3 import dedup key
});

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
    source: text("source", { enum: ["MANUAL", "B3_IMPORT"] })
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

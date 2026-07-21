import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
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
  accountType: text("account_type", {
    enum: ["CHECKING", "INVESTMENT"],
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

export const expenses = sqliteTable("expenses", {
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
});

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
  }),
);

export const assetTypesRelations = relations(assetTypes, ({ many }) => ({
  investmentTransactions: many(investmentTransactions),
}));

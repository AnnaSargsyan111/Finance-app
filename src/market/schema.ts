import {
  pgSchema, text, timestamp, numeric, date, integer, boolean, jsonb, primaryKey, index, bigserial, doublePrecision, bigint,
} from "drizzle-orm/pg-core";

/** Schema `market`: shared public data (FX, cache, universe, fundamentals, prices, snapshots). No user data. */
export const marketSchema = pgSchema("market");

export const fxRate = marketSchema.table(
  "fx_rate",
  {
    iso: text("iso").notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    /** rate for `amount` units of `iso`, in AMD (as published; divide by amount for the per-unit rate) */
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    amount: integer("amount").notNull().default(1),
    diff: numeric("diff", { precision: 18, scale: 8 }),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.iso, t.rateDate] })],
);

export const cacheEntry = marketSchema.table("cache_entry", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Lease-style lock so concurrent requests cause at most one upstream refresh. */
export const cacheLock = marketSchema.table("cache_lock", {
  key: text("key").primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
  owner: text("owner").notNull(),
});

export const universe = marketSchema.table("universe", {
  symbol: text("symbol").primaryKey(),
  cik: text("cik"),
  name: text("name").notNull(),
  sector: text("sector"),
  industry: text("industry"),
  inIndex: boolean("in_index").notNull().default(true),
  /** duplicate share class dropped (one line per issuer), e.g. GOOG dropped in favour of GOOGL */
  dropReason: text("drop_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fundamentals = marketSchema.table(
  "fundamentals",
  {
    symbol: text("symbol").notNull(),
    /** calendar-aligned fiscal year of the annual frame (e.g. 2025) */
    fiscalYear: integer("fiscal_year").notNull(),
    revenue: numeric("revenue", { precision: 24, scale: 2 }),
    netIncome: numeric("net_income", { precision: 24, scale: 2 }),
    epsDiluted: numeric("eps_diluted", { precision: 18, scale: 6 }),
    grossProfit: numeric("gross_profit", { precision: 24, scale: 2 }),
    operatingIncome: numeric("operating_income", { precision: 24, scale: 2 }),
    equity: numeric("equity", { precision: 24, scale: 2 }),
    assets: numeric("assets", { precision: 24, scale: 2 }),
    liabilities: numeric("liabilities", { precision: 24, scale: 2 }),
    opCashFlow: numeric("op_cash_flow", { precision: 24, scale: 2 }),
    capex: numeric("capex", { precision: 24, scale: 2 }),
    dividendsPerShare: numeric("dividends_per_share", { precision: 18, scale: 6 }),
    sharesOut: numeric("shares_out", { precision: 24, scale: 0 }),
    /** which XBRL concept/period-end supplied each value (transparency + debugging) */
    sources: jsonb("sources"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.fiscalYear] })],
);

export const priceDaily = marketSchema.table(
  "price_daily",
  {
    symbol: text("symbol").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    close: doublePrecision("close").notNull(),
    adjClose: doublePrecision("adj_close").notNull(),
    volume: bigint("volume", { mode: "number" }),
    source: text("source").notNull().default("unknown"),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] }), index("price_daily_date_idx").on(t.date)],
);

export const snapshot = marketSchema.table(
  "snapshot",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    asOf: date("as_of", { mode: "string" }).notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** { records: SnapshotRecord[], stableLeaders, coverage, ... } */
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("snapshot_as_of_idx").on(t.asOf)],
);

/** Pointer flipped inside one transaction after a complete snapshot has been written (atomic swap). */
export const snapshotPointer = marketSchema.table("snapshot_pointer", {
  name: text("name").primaryKey(),
  snapshotId: bigint("snapshot_id", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRun = marketSchema.table("job_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  stats: jsonb("stats"),
});

/** Last 7 days of news candidates (Change Order 1, 17.2) so `/news/{id}` keeps working after a refresh. Headlines + feed summary only. */
export const newsItem = marketSchema.table(
  "news_item",
  {
    /** first 16 hex chars of sha256(canonical URL) */
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    source: text("source").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    region: text("region").notNull(),
    category: text("category").notNull(),
    topic: text("topic").notNull(),
    summary: text("summary"),
    imageUrl: text("image_url"),
    feedId: text("feed_id").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("news_item_published_idx").on(t.publishedAt)],
);

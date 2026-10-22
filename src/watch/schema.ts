import { pgSchema, text, uuid, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Schema `watch`: "tell me by email when the stocks of a saved recommendation change" (opt-in, one switch per saved recommendation).
 * A row only says WHO asked about WHICH saved recommendation and what was last reported. It holds no copy of the recommendation
 * (that stays in invest.saved_recommendation) and no relationship to any Personal Finance table.
 */
export const watchSchema = pgSchema("watch");

export const recommendationWatch = watchSchema.table(
  "recommendation_watch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    /** invest.saved_recommendation.id (no foreign key across modules; the service checks the owner) */
    recommendationId: uuid("recommendation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** the values reported last time (a WatchView); null until the first email: then the saved recommendation itself is the baseline */
    baseline: jsonb("baseline"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastEmailedAt: timestamp("last_emailed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("watch_user_rec_uq").on(t.userId, t.recommendationId), index("watch_user_idx").on(t.userId)],
);

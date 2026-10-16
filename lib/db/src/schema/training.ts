import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Separate account-scoped records for run history, saved models and the one-time trial.
export const trainingState = pgTable("training_state", {
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.kind] })]);

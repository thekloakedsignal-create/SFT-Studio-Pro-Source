import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Durable training flow, job ownership, saved models, and one-time chat sessions.
export const trainingRecords = pgTable("training_records", {
  kind: text("kind").notNull(),
  id: text("id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.kind, table.id] })]);

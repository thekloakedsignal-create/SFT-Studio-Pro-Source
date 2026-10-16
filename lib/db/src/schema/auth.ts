import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Retained legacy session data; Clerk now owns active sessions. Do not drop.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  // Only manage the auth sessions table; project tables belong to the API server schema.
  tablesFilter: ["sessions"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

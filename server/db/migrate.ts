import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./index.js";

/** Applies SQL migrations from ./drizzle. Safe to run repeatedly. */
export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
}

if (import.meta.main) {
  await runMigrations();
  console.log("Migrations applied.");
  await closeDb();
}

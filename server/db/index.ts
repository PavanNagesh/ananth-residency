import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof createDb>;

function createDb(url: string) {
  const client = postgres(url, {
    // Serverless functions: one connection per instance against Neon's pooler.
    max: process.env.VERCEL ? 1 : 10,
    // Required behind PgBouncer-style poolers (Neon pooled URLs).
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return Object.assign(drizzle(client, { schema }), { $client: client });
}

let cached: DB | undefined;

/** Lazily connects on first use so tests and scripts can set DATABASE_URL first. */
export function getDb(): DB {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    cached = createDb(url);
  }
  return cached;
}

export async function closeDb() {
  if (cached) {
    await cached.$client.end({ timeout: 5 });
    cached = undefined;
  }
}

export { schema };

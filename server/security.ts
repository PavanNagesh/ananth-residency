import type { Context } from "hono";
import { sql } from "drizzle-orm";
import type { DB } from "./db/index.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";

/**
 * Rate limits backed by Postgres, so they hold across every serverless instance
 * (an in-memory counter resets per instance and can be dodged).
 */
export type Limit = { name: string; max: number; windowSec: number; message: string };

export const LIMITS = {
  staffLoginPerAccount: { name: "staff-login-id", max: 5, windowSec: 15 * 60, message: "Too many wrong passwords. Wait 15 minutes, or ask the owner to reset your password." },
  staffLoginPerIp: { name: "staff-login-ip", max: 20, windowSec: 15 * 60, message: "Too many sign-in attempts from this network. Wait 15 minutes and try again." },
  customerSignInPerIp: { name: "customer-signin-ip", max: 30, windowSec: 15 * 60, message: "Too many sign-in attempts. Wait a few minutes and try again." },
  ordersPerCustomerHour: { name: "orders-hour", max: 6, windowSec: 60 * 60, message: "You have placed several orders in the last hour. Call the restaurant to place another." },
  ordersPerCustomerDay: { name: "orders-day", max: 20, windowSec: 24 * 60 * 60, message: "Daily order limit reached for this number. Call the restaurant to order." },
  ordersPerIpHour: { name: "orders-ip", max: 30, windowSec: 60 * 60, message: "Too many orders from this network. Call the restaurant to order." },
  paymentsPerCustomer: { name: "payments", max: 20, windowSec: 60 * 60, message: "Too many payment attempts. Wait a few minutes, or choose pay on delivery." },
  accountWritesPerCustomer: { name: "account-writes", max: 60, windowSec: 60 * 60, message: "Too many changes in a short time. Wait a few minutes and try again." },
} satisfies Record<string, Limit>;

/** The client's IP: the first X-Forwarded-For entry only where the proxy is trusted (see env.trustProxy). */
export function clientIp(c: Context): string {
  if (env.trustProxy) {
    const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
    const real = c.req.header("x-real-ip")?.trim();
    if (real && real.length <= 64) return real;
  }
  return "local";
}

const keyOf = (limit: Limit, subject: string) => `${limit.name}:${subject.toLowerCase().slice(0, 120)}`;

function tooMany(limit: Limit, resetAt: Date): never {
  const retry = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  throw new HttpError(429, limit.message, { _retryAfter: String(retry) });
}

/** Counts one attempt and refuses (429) once the window's maximum is passed. */
export async function hit(db: DB, limit: Limit, subject: string) {
  const key = keyOf(limit, subject);
  const rows = await db.execute<{ hits: number; reset_at: Date }>(sql`
    insert into rate_limits (key, hits, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${limit.windowSec}))
    on conflict (key) do update set
      hits = case when rate_limits.reset_at <= now() then 1 else rate_limits.hits + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning hits, reset_at`);
  const row = rows[0];
  // Tidy expired rows now and then; cheap with the primary key.
  if (Math.random() < 0.02) await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 day'`);
  if (row && row.hits > limit.max) tooMany(limit, new Date(row.reset_at));
}

/** Refuses (429) if the subject is already over the limit, without counting this attempt. */
export async function check(db: DB, limit: Limit, subject: string) {
  const rows = await db.execute<{ hits: number; reset_at: Date }>(
    sql`select hits, reset_at from rate_limits where key = ${keyOf(limit, subject)} and reset_at > now()`,
  );
  const row = rows[0];
  if (row && row.hits >= limit.max) tooMany(limit, new Date(row.reset_at));
}

export async function clear(db: DB, limit: Limit, subject: string) {
  await db.execute(sql`delete from rate_limits where key = ${keyOf(limit, subject)}`);
}

/** Largest order accepted online; bigger orders are taken by phone. Also keeps totals far from integer overflow. */
export const MAX_ORDER_TOTAL_PAISE = 25_000_00;

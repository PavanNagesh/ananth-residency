import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db/index.js";
import { customers, staff } from "../db/schema.js";
import { HttpError, type AppEnv } from "../http.js";
import { readSession } from "./session.js";

export const requireCustomer = createMiddleware<AppEnv>(async (c, next) => {
  const s = await readSession(c, "customer");
  const id = s ? Number(s.sub) : NaN;
  if (!Number.isInteger(id)) throw new HttpError(401, "Sign in with your phone number to continue.");
  const [row] = await getDb()
    .select({ id: customers.id, phone: customers.phone, name: customers.name, v: customers.sessionVersion })
    .from(customers)
    .where(eq(customers.id, id));
  // A signed-out session (older version) is refused even though its signature is still valid.
  if (!row || row.v !== s?.v) throw new HttpError(401, "Your session has ended. Sign in again to continue.");
  c.set("customer", { id: row.id, phone: row.phone, name: row.name });
  await next();
});

export const requireStaff = createMiddleware<AppEnv>(async (c, next) => {
  const s = await readSession(c, "staff");
  const id = s ? Number(s.sub) : NaN;
  if (!Number.isInteger(id)) throw new HttpError(401, "Sign in to the restaurant dashboard to continue.");
  const [row] = await getDb()
    .select({ id: staff.id, name: staff.name, phone: staff.phone, role: staff.role, isActive: staff.isActive, v: staff.sessionVersion })
    .from(staff)
    .where(eq(staff.id, id));
  if (!row || !row.isActive || row.v !== s?.v) {
    throw new HttpError(401, "Your session has ended. Sign in again to continue.");
  }
  c.set("staff", { id: row.id, name: row.name, phone: row.phone, role: row.role });
  await next();
});

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("staff")?.role !== "owner") throw new HttpError(403, "Only the owner can change this. Ask the owner to sign in.");
  await next();
});

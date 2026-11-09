import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  addressSchema,
  devOtpSchema,
  firebaseLoginSchema,
  placeOrderSchema,
  profileSchema,
  razorpayVerifySchema,
} from "../../shared/schemas.js";
import type { Address, Customer, RazorpayCheckout } from "../../shared/types.js";
import { verifyFirebasePhoneToken } from "../auth/firebase.js";
import { requireCustomer } from "../auth/middleware.js";
import { clearSession, issueSession, readSession } from "../auth/session.js";
import { getDb } from "../db/index.js";
import { addresses, customers, orderEvents, orders } from "../db/schema.js";
import { DEV_OTP_CODE, env } from "../env.js";
import { body, HttpError, idParam, notFound, type AppEnv } from "../http.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../razorpay.js";
import { check, clientIp, hit, LIMITS } from "../security.js";
import { z } from "zod";
import { loadSettings, orderDto, ordersWithEvents, placeOrder } from "../services.js";

export const customerRoutes = new Hono<AppEnv>();

// ---- Sign-in ----------------------------------------------------------------

async function signInPhone(phone: string, firebaseUid: string | null) {
  const db = getDb();
  const [row] = await db
    .insert(customers)
    .values({ phone, firebaseUid, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: customers.phone,
      set: { lastLoginAt: new Date(), ...(firebaseUid ? { firebaseUid } : {}) },
    })
    .returning({ id: customers.id, phone: customers.phone, name: customers.name, v: customers.sessionVersion });
  const { v, ...customer } = row!;
  return { customer, v };
}

customerRoutes.get("/auth/config", (c) =>
  c.json({ firebase: Boolean(env.firebaseProjectId), devOtp: env.devOtpEnabled }),
);

customerRoutes.post("/auth/firebase", async (c) => {
  const projectId = env.firebaseProjectId;
  if (!projectId) throw new HttpError(503, "Phone sign-in is not set up yet. Call the restaurant to order.");
  await hit(getDb(), LIMITS.customerSignInPerIp, clientIp(c));
  const { idToken } = await body(c, firebaseLoginSchema);
  let verified: { uid: string; phone: string };
  try {
    verified = await verifyFirebasePhoneToken(idToken, projectId);
  } catch {
    throw new HttpError(401, "We could not verify that code. Request a new code and try again.");
  }
  const { customer, v } = await signInPhone(verified.phone, verified.uid);
  await issueSession(c, "customer", { sub: String(customer.id), v });
  return c.json({ customer: customer satisfies Customer });
});

customerRoutes.post("/auth/dev-otp", async (c) => {
  if (!env.devOtpEnabled) throw new HttpError(503, "Phone sign-in is not set up yet. Call the restaurant to order.");
  await hit(getDb(), LIMITS.customerSignInPerIp, clientIp(c));
  const { phone, code } = await body(c, devOtpSchema);
  if (code !== DEV_OTP_CODE) throw new HttpError(401, "That code is not right. In development the code is 123456.", { code: "Enter 123456." });
  const { customer, v } = await signInPhone(phone, null);
  await issueSession(c, "customer", { sub: String(customer.id), v });
  return c.json({ customer: customer satisfies Customer });
});

/** Who is signed in, without a 401 for visitors (keeps the browser console clean). */
customerRoutes.get("/auth/session", async (c) => {
  const s = await readSession(c, "customer");
  const id = s ? Number(s.sub) : NaN;
  if (!Number.isInteger(id)) return c.json({ customer: null });
  const [row] = await getDb()
    .select({ id: customers.id, phone: customers.phone, name: customers.name, v: customers.sessionVersion })
    .from(customers)
    .where(eq(customers.id, id));
  if (!row || row.v !== s?.v) return c.json({ customer: null });
  return c.json({ customer: { id: row.id, phone: row.phone, name: row.name } satisfies Customer });
});

/** Signing out ends every session of this customer (all phones), not just this cookie. */
customerRoutes.post("/auth/logout", async (c) => {
  const s = await readSession(c, "customer");
  const id = s ? Number(s.sub) : NaN;
  if (Number.isInteger(id)) {
    await getDb()
      .update(customers)
      .set({ sessionVersion: sql`${customers.sessionVersion} + 1` })
      .where(and(eq(customers.id, id), eq(customers.sessionVersion, s?.v ?? -1)));
  }
  clearSession(c, "customer");
  return c.json({ ok: true });
});

// ---- Profile & addresses -------------------------------------------------------

const me = new Hono<AppEnv>();
me.use(requireCustomer);
// Every change to the account counts against one hourly budget.
me.use(async (c, next) => {
  if (c.req.method !== "GET") await hit(getDb(), LIMITS.accountWritesPerCustomer, String(c.get("customer").id));
  await next();
});

me.get("/", (c) => c.json({ customer: c.get("customer") satisfies Customer }));

me.put("/", async (c) => {
  const { name } = await body(c, profileSchema);
  const [row] = await getDb()
    .update(customers)
    .set({ name })
    .where(eq(customers.id, c.get("customer").id))
    .returning({ id: customers.id, phone: customers.phone, name: customers.name });
  return c.json({ customer: row! satisfies Customer });
});

const addressDto = (a: typeof addresses.$inferSelect): Address => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  landmark: a.landmark,
  area: a.area,
  pincode: a.pincode,
  lat: a.lat,
  lng: a.lng,
  accuracyM: a.accuracyM,
  isDefault: a.isDefault,
});

me.get("/addresses", async (c) => {
  const rows = await getDb()
    .select()
    .from(addresses)
    .where(and(eq(addresses.customerId, c.get("customer").id), isNull(addresses.deletedAt)))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return c.json({ addresses: rows.map(addressDto) });
});

me.post("/addresses", async (c) => {
  const input = await body(c, addressSchema);
  const customerId = c.get("customer").id;
  const row = await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.customerId, customerId), isNull(addresses.deletedAt)));
    if (existing.length >= 10) throw new HttpError(422, "You can save up to 10 addresses. Remove one to add another.");
    const makeDefault = input.isDefault || existing.length === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
    const [created] = await tx
      .insert(addresses)
      .values({ ...input, label: input.label || "Home", customerId, isDefault: makeDefault })
      .returning();
    return created!;
  });
  return c.json({ address: addressDto(row) }, 201);
});

me.put("/addresses/:id", async (c) => {
  const id = idParam(c);
  const input = await body(c, addressSchema);
  const customerId = c.get("customer").id;
  const row = await getDb().transaction(async (tx) => {
    if (input.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
    const [updated] = await tx
      .update(addresses)
      .set({ ...input, label: input.label || "Home" })
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId), isNull(addresses.deletedAt)))
      .returning();
    if (!updated) throw notFound("That address");
    return updated;
  });
  return c.json({ address: addressDto(row) });
});

me.delete("/addresses/:id", async (c) => {
  const id = idParam(c);
  const customerId = c.get("customer").id;
  await getDb().transaction(async (tx) => {
    const [gone] = await tx
      .update(addresses)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId), isNull(addresses.deletedAt)))
      .returning();
    if (!gone) throw notFound("That address");
    // Keep one default while any address remains.
    const remaining = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(and(eq(addresses.customerId, customerId), isNull(addresses.deletedAt)))
      .orderBy(desc(addresses.createdAt));
    const first = remaining[0];
    if (first && !remaining.some((a) => a.isDefault)) {
      await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, first.id));
    }
  });
  return c.json({ ok: true });
});

customerRoutes.route("/me", me);

// ---- Orders --------------------------------------------------------------------

const myOrders = new Hono<AppEnv>();
myOrders.use(requireCustomer);

async function razorpayCheckoutFor(order: typeof orders.$inferSelect, restaurantName: string): Promise<RazorpayCheckout> {
  const keys = env.razorpay;
  if (!keys) throw new HttpError(422, "Online payment is not available right now. Choose pay on delivery.");
  const rz = await createRazorpayOrder(keys, order.totalPaise, `order-${order.id}`, { orderId: String(order.id) });
  await getDb().update(orders).set({ razorpayOrderId: rz.id }).where(eq(orders.id, order.id));
  return {
    keyId: keys.keyId,
    razorpayOrderId: rz.id,
    amountPaise: order.totalPaise,
    name: restaurantName,
    prefill: { name: order.customerName, contact: order.customerPhone },
  };
}

myOrders.post("/", async (c) => {
  const input = await body(c, placeOrderSchema);
  const customer = c.get("customer");
  const db0 = getDb();
  // Attempts per network are counted; per customer, only orders actually placed count.
  await hit(db0, LIMITS.ordersPerIpHour, clientIp(c));
  await check(db0, LIMITS.ordersPerCustomerHour, String(customer.id));
  await check(db0, LIMITS.ordersPerCustomerDay, String(customer.id));
  const { order, events, settings } = await placeOrder(getDb(), { ...input, customer });
  await hit(db0, LIMITS.ordersPerCustomerHour, String(customer.id));
  await hit(db0, LIMITS.ordersPerCustomerDay, String(customer.id));
  const razorpay = order.paymentMethod === "online" ? await razorpayCheckoutFor(order, settings.restaurantName) : null;
  return c.json({ order: orderDto(order, events), razorpay }, 201);
});

myOrders.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, c.get("customer").id))
    .orderBy(desc(orders.createdAt))
    .limit(30);
  return c.json({ orders: await ordersWithEvents(db, rows) });
});

async function ownOrder(customerId: number, id: number) {
  const [row] = await getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.customerId, customerId)));
  if (!row) throw notFound("That order");
  return row;
}

myOrders.get("/:id", async (c) => {
  const row = await ownOrder(c.get("customer").id, idParam(c));
  const [order] = await ordersWithEvents(getDb(), [row]);
  return c.json({ order: order! });
});

myOrders.post("/:id/cancel", async (c) => {
  const id = idParam(c);
  const customerId = c.get("customer").id;
  const db = getDb();
  const [row] = await db
    .update(orders)
    .set({ status: "cancelled", cancelReason: "Cancelled by customer" })
    .where(and(eq(orders.id, id), eq(orders.customerId, customerId), inArray(orders.status, ["new", "pending_payment"])))
    .returning();
  if (!row) {
    await ownOrder(customerId, id);
    throw new HttpError(409, "The restaurant has already confirmed this order. Call them to change or cancel it.");
  }
  await db.insert(orderEvents).values({ orderId: id, status: "cancelled", note: "Cancelled by customer" });
  const [order] = await ordersWithEvents(db, [row]);
  return c.json({ order: order! });
});

/** Retry online payment, or switch an unpaid online order to pay on delivery. */
myOrders.post("/:id/payment", async (c) => {
  const id = idParam(c);
  const customerId = c.get("customer").id;
  const { method } = await body(c, z.object({ method: z.enum(["online", "cod"]) }));
  const db = getDb();
  await hit(db, LIMITS.paymentsPerCustomer, String(customerId));
  const row = await ownOrder(customerId, id);
  if (row.status !== "pending_payment") throw new HttpError(409, "This order no longer needs payment.");
  const s = await loadSettings(db);
  if (method === "cod") {
    if (!s.acceptingOrders) throw new HttpError(409, s.pausedMessage);
    const [updated] = await db
      .update(orders)
      .set({ paymentMethod: "cod", status: "new" })
      .where(and(eq(orders.id, id), eq(orders.status, "pending_payment")))
      .returning();
    if (!updated) throw new HttpError(409, "This order no longer needs payment.");
    await db.insert(orderEvents).values({ orderId: id, status: "new", note: "Switched to pay on delivery" });
    const [order] = await ordersWithEvents(db, [updated]);
    return c.json({ order: order!, razorpay: null });
  }
  const razorpay = await razorpayCheckoutFor(row, s.restaurantName);
  const [order] = await ordersWithEvents(db, [row]);
  return c.json({ order: order!, razorpay });
});

customerRoutes.route("/orders", myOrders);

// ---- Payment confirmation from Razorpay Checkout ---------------------------------

customerRoutes.post("/payments/razorpay/verify", requireCustomer, async (c) => {
  const keys = env.razorpay;
  if (!keys) throw new HttpError(503, "Online payment is not set up.");
  const input = await body(c, razorpayVerifySchema);
  const db = getDb();
  await hit(db, LIMITS.paymentsPerCustomer, String(c.get("customer").id));
  const row = await ownOrder(c.get("customer").id, input.orderId);
  if (row.razorpayOrderId !== input.razorpay_order_id) {
    throw new HttpError(422, "This payment does not match your order. Contact the restaurant before paying again.");
  }
  if (!verifyPaymentSignature(keys.keySecret, input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    throw new HttpError(422, "We could not confirm this payment. If money was taken, the restaurant will see it and call you.");
  }
  const updated = await markOrderPaid(row.id, input.razorpay_payment_id);
  const [order] = await ordersWithEvents(db, [updated ?? row]);
  return c.json({ order: order! });
});

/** Idempotent: moves pending_payment → new and records the payment. Used by verify and webhook. */
export async function markOrderPaid(orderId: number, paymentId: string) {
  const db = getDb();
  const [updated] = await db
    .update(orders)
    .set({ paymentStatus: "paid", razorpayPaymentId: paymentId, status: "new" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
    .returning();
  if (updated) {
    await db.insert(orderEvents).values({ orderId, status: "new", note: "Paid online" });
    return updated;
  }
  // Already moved on (e.g. webhook arrived first): just make sure payment is recorded.
  const [same] = await db
    .update(orders)
    .set({ paymentStatus: "paid", razorpayPaymentId: paymentId })
    .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "paid")))
    .returning();
  return same;
}

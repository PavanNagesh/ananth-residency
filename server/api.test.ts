/**
 * API tests against a real Postgres database.
 * Uses TEST_DATABASE_URL (default: the local dev cluster's `ananth_test` database);
 * the schema is reset and re-seeded once per run.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5544/ananth_test";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.DEV_OTP = "true";
process.env.OWNER_PHONE = "9000000009";
process.env.OWNER_PASSWORD = "owner-pass-123";
process.env.OWNER_NAME = "Test Owner";
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const { sql } = await import("drizzle-orm");
const { getDb, closeDb } = await import("./db/index.js");
const { runMigrations } = await import("./db/migrate.js");
const { seed } = await import("./db/seed.js");
const { app } = await import("./app.js");
const { computeBill } = await import("../shared/bill.js");

type Json = Record<string, any>;

/** Tiny cookie-keeping client around app.request. */
function client() {
  let cookie = "";
  return async (path: string, init: { method?: string; body?: unknown; origin?: string } = {}) => {
    const headers: Record<string, string> = { Host: "localhost" };
    if (cookie) headers.Cookie = cookie;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.origin) headers.Origin = init.origin;
    const res = await app.request(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as Json };
  };
}

const customer = client();
const staffC = client();
let menu: Json;
let addressId: number;
const find = (name: string) => menu.categories.flatMap((c: Json) => c.items).find((i: Json) => i.name === name);

beforeAll(async () => {
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations();
  await seed(db);
});

afterAll(async () => {
  await closeDb();
});

describe("bill rule", () => {
  const pricing = { deliveryFeePaise: 5000, freeDeliveryThresholdPaise: 50000, gstBps: 500 };
  test("charges the delivery fee below ₹500", () => {
    expect(computeBill(49900, pricing)).toMatchObject({ deliveryFeePaise: 5000, gstPaise: 2495, totalPaise: 49900 + 2495 + 5000, remainingForFreeDeliveryPaise: 100 });
  });
  test("delivery is free at exactly ₹500", () => {
    expect(computeBill(50000, pricing)).toMatchObject({ deliveryFeePaise: 0, gstPaise: 2500, totalPaise: 52500, remainingForFreeDeliveryPaise: 0 });
  });
  test("empty cart costs nothing", () => {
    expect(computeBill(0, pricing).totalPaise).toBe(0);
  });
});

describe("menu", () => {
  test("lists seeded categories with available dishes", async () => {
    const r = await customer("/menu");
    expect(r.status).toBe(200);
    menu = r.json;
    expect(menu.categories.length).toBe(13);
    expect(menu.pricing).toEqual({ deliveryFeePaise: 5000, freeDeliveryThresholdPaise: 50000, gstBps: 500 });
    const icecream = menu.categories.find((c: Json) => c.name === "Ice Cream");
    expect(icecream.items[0].variants.length).toBe(2);
  });
});

describe("customer sign-in and addresses", () => {
  test("rejects a wrong development code", async () => {
    const r = await customer("/auth/dev-otp", { body: { phone: "9845012345", code: "000000" } });
    expect(r.status).toBe(401);
  });
  test("rejects an invalid phone number", async () => {
    const r = await customer("/auth/dev-otp", { body: { phone: "12345", code: "123456" } });
    expect(r.status).toBe(422);
    expect(r.json.fields.phone).toContain("10-digit");
  });
  test("signs in and sets a name", async () => {
    const r = await customer("/auth/dev-otp", { body: { phone: "+91 98450 12345", code: "123456" } });
    expect(r.status).toBe(200);
    expect(r.json.customer.phone).toBe("+919845012345");
    const named = await customer("/me", { method: "PUT", body: { name: "Asha" } });
    expect(named.json.customer.name).toBe("Asha");
  });
  test("validates and saves an address", async () => {
    const bad = await customer("/me/addresses", { body: { line1: "x", area: "", pincode: "58" } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.json.fields)).toEqual(expect.arrayContaining(["line1", "area", "pincode"]));
    const ok = await customer("/me/addresses", { body: { line1: "12 Lamington Road", landmark: "Near LIC", area: "J C Nagar", pincode: "580020" } });
    expect(ok.status).toBe(201);
    expect(ok.json.address.isDefault).toBe(true);
    addressId = ok.json.address.id;
    expect(ok.json.address).toMatchObject({ lat: null, lng: null, accuracyM: null });
  });
  test("map pins need both coordinates, inside India", async () => {
    const base = { line1: "12 Lamington Road", landmark: "Near LIC", area: "J C Nagar", pincode: "580020" };
    const half = await customer("/me/addresses", { body: { ...base, lat: 15.35 } });
    expect(half.status).toBe(422);
    expect(half.json.fields.lat).toContain("incomplete");
    const zero = await customer("/me/addresses", { body: { ...base, lat: 0, lng: 0 } });
    expect(zero.status).toBe(422);
    expect(zero.json.fields.lat).toContain("outside India");
    const pinned = await customer(`/me/addresses/${addressId}`, {
      method: "PUT",
      body: { ...base, lat: 15.3502, lng: 75.1418, accuracyM: 12, isDefault: true },
    });
    expect(pinned.status).toBe(200);
    expect(pinned.json.address).toMatchObject({ lat: 15.3502, lng: 75.1418, accuracyM: 12 });
  });
  test("protected routes need a session", async () => {
    const anon = client();
    expect((await anon("/orders")).status).toBe(401);
    expect((await anon("/staff/orders")).status).toBe(401);
  });
});

describe("placing orders", () => {
  test("re-prices from the database and adds the delivery fee below ₹500", async () => {
    const soup = find("Tomato Soup");
    const r = await customer("/orders", { body: { lines: [{ itemId: soup.id, qty: 1 }], addressId, paymentMethod: "cod" } });
    expect(r.status).toBe(201);
    expect(r.json.order).toMatchObject({ orderNo: "#001", status: "new", subtotalPaise: 18000, gstPaise: 900, deliveryFeePaise: 5000, totalPaise: 23900 });
    // The restaurant sees the pin as it was when the order was placed.
    expect(r.json.order.address).toMatchObject({ lat: 15.3502, lng: 75.1418, accuracyM: 12 });
  });

  test("free delivery on ₹500 and above, options priced per option", async () => {
    const naan = find("Naan");
    const butter = naan.variants.find((v: Json) => v.name === "With butter");
    const paneer = find("Paneer Butter Masala");
    const r = await customer("/orders", {
      body: { lines: [{ itemId: naan.id, variantId: butter.id, qty: 2 }, { itemId: paneer.id, qty: 1 }], addressId, paymentMethod: "cod", note: "Less spicy" },
    });
    expect(r.status).toBe(201);
    // 2 × 75 + 290 = 440 → fee applies; add one more naan to cross 500
    expect(r.json.order.subtotalPaise).toBe(44000);
    expect(r.json.order.deliveryFeePaise).toBe(5000);
    const big = await customer("/orders", { body: { lines: [{ itemId: paneer.id, qty: 2 }], addressId, paymentMethod: "cod" } });
    expect(big.json.order.subtotalPaise).toBe(58000);
    expect(big.json.order.deliveryFeePaise).toBe(0);
    expect(big.json.order.orderNo).toBe("#003");
  });

  test("an option item without a chosen option is rejected", async () => {
    const naan = find("Naan");
    const r = await customer("/orders", { body: { lines: [{ itemId: naan.id, qty: 1 }], addressId, paymentMethod: "cod" } });
    expect(r.status).toBe(409);
  });

  test("online payment is refused when Razorpay is not configured", async () => {
    const soup = find("Tomato Soup");
    const r = await customer("/orders", { body: { lines: [{ itemId: soup.id, qty: 1 }], addressId, paymentMethod: "online" } });
    expect(r.status).toBe(422);
  });
});

describe("staff", () => {
  test("wrong password is refused, right one signs in", async () => {
    expect((await staffC("/staff/login", { body: { identifier: "9000000009", password: "nope" } })).status).toBe(401);
    const ok = await staffC("/staff/login", { body: { identifier: "test owner", password: "owner-pass-123" } });
    expect(ok.status).toBe(200);
    expect(ok.json.staff.role).toBe("owner");
  });

  test("sees new orders and moves one through its statuses", async () => {
    const board = await staffC("/staff/orders");
    expect(board.json.summary.unacknowledged).toBe(3);
    const first = board.json.orders.find((o: Json) => o.orderNo === "#001");
    expect(first.customerPhone).toBe("+919845012345");
    const skip = await staffC(`/staff/orders/${first.id}`, { method: "PATCH", body: { action: "delivered" } });
    expect(skip.status).toBe(409);
    for (const action of ["confirm", "preparing", "out_for_delivery", "delivered"]) {
      const r = await staffC(`/staff/orders/${first.id}`, { method: "PATCH", body: { action } });
      expect(r.status).toBe(200);
    }
    const mine = await customer(`/orders/${first.id}`);
    expect(mine.json.order.status).toBe("delivered");
    expect(mine.json.order.paymentStatus).toBe("paid");
    expect(mine.json.order.events.map((e: Json) => e.status)).toEqual(["new", "confirmed", "preparing", "out_for_delivery", "delivered"]);
  });

  test("cancelling needs a reason; customer cannot cancel a confirmed order", async () => {
    const board = await staffC("/staff/orders");
    const second = board.json.orders.find((o: Json) => o.orderNo === "#002");
    expect((await staffC(`/staff/orders/${second.id}`, { method: "PATCH", body: { action: "cancel" } })).status).toBe(422);
    await staffC(`/staff/orders/${second.id}`, { method: "PATCH", body: { action: "confirm" } });
    expect((await customer(`/orders/${second.id}/cancel`, { body: {} })).status).toBe(409);
    const third = board.json.orders.find((o: Json) => o.orderNo === "#003");
    const c = await customer(`/orders/${third.id}/cancel`, { body: {} });
    expect(c.json.order.status).toBe("cancelled");
  });

  test("switching a dish off hides it and blocks ordering it", async () => {
    const soup = find("Tomato Soup");
    await staffC(`/staff/items/${soup.id}/availability`, { method: "PATCH", body: { isAvailable: false } });
    const m = await customer("/menu");
    expect(m.json.categories.flatMap((c: Json) => c.items).some((i: Json) => i.id === soup.id)).toBe(false);
    const r = await customer("/orders", { body: { lines: [{ itemId: soup.id, qty: 1 }], addressId, paymentMethod: "cod" } });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("Tomato Soup");
  });

  test("applying a preset turns exactly its dishes on", async () => {
    const presets = await staffC("/staff/presets");
    const breakfast = presets.json.presets.find((p: Json) => p.name === "Breakfast");
    const r = await staffC(`/staff/presets/${breakfast.id}/apply`, { body: {} });
    expect(r.json.available).toBe(breakfast.itemIds.length);
    const m = await customer("/menu");
    const visible = m.json.categories.flatMap((c: Json) => c.items).map((i: Json) => i.id).sort();
    expect(visible).toEqual([...breakfast.itemIds].sort());
  });

  test("owner changes fees; customers see them", async () => {
    const s = (await staffC("/staff/settings")).json.settings;
    const r = await staffC("/staff/settings", { method: "PUT", body: { ...s, restaurantPhone: "8088415720", deliveryFeePaise: 4000, freeDeliveryThresholdPaise: 60000, gstBps: 0 } });
    expect(r.status).toBe(200);
    expect((await customer("/menu")).json.pricing).toEqual({ deliveryFeePaise: 4000, freeDeliveryThresholdPaise: 60000, gstBps: 0 });
  });

  test("pausing orders blocks checkout", async () => {
    await staffC("/staff/settings/accepting", { method: "PUT", body: { acceptingOrders: false } });
    const item = (await customer("/menu")).json.categories[0].items[0];
    const r = await customer("/orders", { body: { lines: [{ itemId: item.id, variantId: item.variants[0]?.id ?? null, qty: 1 }], addressId, paymentMethod: "cod" } });
    expect(r.status).toBe(409);
    await staffC("/staff/settings/accepting", { method: "PUT", body: { acceptingOrders: true } });
  });

  test("staff accounts: non-owners cannot manage the team; deactivation ends sessions", async () => {
    const created = await staffC("/staff/users", { body: { name: "Counter", phone: "9000000010", password: "counter-pass-1" } });
    expect(created.status).toBe(201);
    const counter = client();
    await counter("/staff/login", { body: { identifier: "9000000010", password: "counter-pass-1" } });
    expect((await counter("/staff/orders")).status).toBe(200);
    expect((await counter("/staff/users")).status).toBe(403);
    expect((await counter("/staff/settings", { method: "PUT", body: {} })).status).toBe(403);
    await staffC(`/staff/users/${created.json.user.id}`, { method: "PATCH", body: { isActive: false } });
    expect((await counter("/staff/orders")).status).toBe(401);
  });

  test("blocks cross-site writes", async () => {
    const r = await staffC("/staff/settings/accepting", { method: "PUT", body: { acceptingOrders: false }, origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });
});

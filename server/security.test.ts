/**
 * Security tests: each one is an attack, and passes only when the app refuses it.
 * Runs against a real Postgres (TEST_DATABASE_URL, default: the local dev cluster's ananth_test).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5544/ananth_test";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.DEV_OTP = "true";
process.env.TRUST_PROXY = "true"; // lets each test client have its own IP via X-Forwarded-For
process.env.OWNER_PHONE = "9000000009";
process.env.OWNER_PASSWORD = "owner-pass-123";
process.env.OWNER_NAME = "Test Owner";
delete process.env.VERCEL;
delete process.env.APP_ORIGINS;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.RAZORPAY_WEBHOOK_SECRET;

const { sql, eq } = await import("drizzle-orm");
const { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } = await import("jose");
const { createHmac } = await import("node:crypto");
const { getDb, closeDb } = await import("./db/index.js");
const { runMigrations } = await import("./db/migrate.js");
const { seed } = await import("./db/seed.js");
const { orders } = await import("./db/schema.js");
const { app } = await import("./app.js");
const { env } = await import("./env.js");
const { verifyFirebasePhoneToken } = await import("./auth/firebase.js");
const { passwordProblem } = await import("../shared/password.js");
const { safeNextPath } = await import("../shared/safe-path.js");

type Json = Record<string, any>;
type Init = { method?: string; body?: unknown; raw?: string; type?: string; headers?: Record<string, string> };

let ipSeq = 10;
/** A browser-like client with its own cookie jar and IP address. */
function client(ip = `198.51.100.${ipSeq++}`) {
  let cookie = "";
  const send = async (path: string, init: Init = {}) => {
    const headers: Record<string, string> = { Host: "localhost", "X-Forwarded-For": ip, ...init.headers };
    if (cookie) headers.Cookie = cookie;
    let payload: string | undefined;
    if (init.raw !== undefined) {
      payload = init.raw;
      headers["Content-Type"] = init.type ?? "text/plain";
    } else if (init.body !== undefined) {
      payload = JSON.stringify(init.body);
      headers["Content-Type"] = init.type ?? "application/json";
    }
    const res = await app.request(`/api${path}`, { method: init.method ?? (payload === undefined ? "GET" : "POST"), headers, body: payload });
    const set = res.headers.get("set-cookie");
    if (set && !/Max-Age=0/i.test(set)) cookie = set.split(";")[0]!;
    if (set && /Max-Age=0/i.test(set)) cookie = "";
    const text = await res.text();
    let json: Json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { _text: text };
    }
    return { status: res.status, json, headers: res.headers };
  };
  // A live accessor (Object.assign would copy the value once and break forged-cookie tests).
  Object.defineProperty(send, "cookie", { get: () => cookie, set: (v: string) => { cookie = v; } });
  return send as typeof send & { cookie: string };
}

async function signIn(phone: string, name = "Test") {
  const c = client();
  const r = await c("/auth/dev-otp", { body: { phone, code: "123456" } });
  expect(r.status).toBe(200);
  if (!r.json.customer.name) await c("/me", { method: "PUT", body: { name } });
  return c;
}

const base = { line1: "12 Lamington Road", landmark: "", area: "J C Nagar", pincode: "580020" };
let menuItems: Json[] = [];
const dish = (name: string) => menuItems.find((i) => i.name === name)!;

beforeAll(async () => {
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations();
  await seed(db);
  const menu = await (await app.request("/api/menu", { headers: { Host: "localhost" } })).json();
  menuItems = menu.categories.flatMap((c: Json) => c.items);
});

afterAll(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------------------------

describe("sessions cannot be forged or reused", () => {
  test("a tampered session cookie is refused", async () => {
    const c = await signIn("9845000001");
    expect((await c("/me")).status).toBe(200);
    const [name, token] = c.cookie.split("=");
    const flipped = token!.slice(0, -2) + (token!.endsWith("A") ? "BB" : "AA");
    c.cookie = `${name}=${flipped}`;
    expect((await c("/me")).status).toBe(401);
  });

  test('an unsigned "alg: none" token is refused', async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "1", v: 1, aud: "customer", iss: "ananth-residency", exp: 9999999999 })}.`;
    const c = client();
    c.cookie = `ar_customer=${forged}`;
    expect((await c("/me")).status).toBe(401);
  });

  test("a token signed with another secret is refused", async () => {
    const forged = await new SignJWT({ v: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuer("ananth-residency")
      .setAudience("staff")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("guessed-secret-guessed-secret-xx"));
    const c = client();
    c.cookie = `ar_staff=${forged}`;
    expect((await c("/staff/orders")).status).toBe(401);
  });

  test("a customer session cannot be used as a staff session", async () => {
    const c = await signIn("9845000002");
    const token = c.cookie.split("=")[1];
    const s = client();
    s.cookie = `ar_staff=${token}`;
    expect((await s("/staff/orders")).status).toBe(401);
  });

  test("signing out ends the session on every device", async () => {
    const phone1 = await signIn("9845000003");
    const phone2 = await signIn("9845000003");
    expect((await phone2("/me")).status).toBe(200);
    await phone1("/auth/logout", { body: {} });
    expect((await phone2("/me")).status).toBe(401);
    expect((await phone2("/auth/session")).json.customer).toBeNull();
  });

  test("a deactivated staff member is signed out at once", async () => {
    const owner = client();
    await owner("/staff/login", { body: { identifier: "9000000009", password: "owner-pass-123" } });
    const created = await owner("/staff/users", { body: { name: "Lakshmi", phone: "9000000020", password: "Tw1light-Kitchen-9" } });
    expect(created.status).toBe(201);
    const counter = client();
    expect((await counter("/staff/login", { body: { identifier: "9000000020", password: "Tw1light-Kitchen-9" } })).status).toBe(200);
    await owner(`/staff/users/${created.json.user.id}`, { method: "PATCH", body: { isActive: false } });
    expect((await counter("/staff/orders")).status).toBe(401);
  });
});

describe("development sign-in and weak secrets cannot reach a deployment", () => {
  test("the fixed development code is refused on any Vercel deployment", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    try {
      expect(env.devOtpEnabled).toBe(false);
      const r = await client()("/auth/dev-otp", { body: { phone: "9845000099", code: "123456" } });
      expect(r.status).toBe(503);
    } finally {
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
    }
  });

  test("placeholder or short session secrets are refused when deployed", () => {
    const saved = process.env.SESSION_SECRET;
    process.env.VERCEL = "1";
    try {
      for (const bad of ["replace-with-a-long-random-string-value-here", "local-dev-secret-0b1f7c2e9a4d4e7f8a1b2c3d", "short-but-24-characters!"]) {
        process.env.SESSION_SECRET = bad;
        expect(() => env.sessionSecret).toThrow();
      }
      process.env.SESSION_SECRET = "9c2f3a7e-41b0-4d55-a0f8-1e6b2c9d7a3f-7Qx";
      expect(() => env.sessionSecret).not.toThrow();
    } finally {
      process.env.SESSION_SECRET = saved;
      delete process.env.VERCEL;
    }
  });
});

describe("Firebase sign-in tokens are verified strictly", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const project = "ananth-test";
  const now = Math.floor(Date.now() / 1000);
  const token = (claims: Json, opts: { aud?: string; iss?: string } = {}) =>
    new SignJWT({ phone_number: "+919845012345", auth_time: now, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("uid-1")
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${project}`)
      .setAudience(opts.aud ?? project)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  test("a fresh token for an Indian number is accepted", async () => {
    expect(await verifyFirebasePhoneToken(await token({}), project, keys)).toEqual({ uid: "uid-1", phone: "+919845012345" });
  });
  test("tokens for another Firebase project are refused", async () => {
    expect(verifyFirebasePhoneToken(await token({}, { aud: "someone-else" }), project, keys)).rejects.toThrow();
    expect(verifyFirebasePhoneToken(await token({}, { iss: "https://evil.example" }), project, keys)).rejects.toThrow();
  });
  test("an old sign-in replayed later is refused", async () => {
    expect(verifyFirebasePhoneToken(await token({ auth_time: now - 3600 }), project, keys)).rejects.toThrow(/too old/);
  });
  test("tokens without a phone, or with a non-Indian number, are refused", async () => {
    expect(verifyFirebasePhoneToken(await token({ phone_number: undefined }), project, keys)).rejects.toThrow();
    expect(verifyFirebasePhoneToken(await token({ phone_number: "+15555550100" }), project, keys)).rejects.toThrow(/Indian/);
  });
  test("a token signed by anyone else is refused", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ phone_number: "+919845012345", auth_time: now })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("uid-1")
      .setIssuer(`https://securetoken.google.com/${project}`)
      .setAudience(project)
      .setExpirationTime("1h")
      .sign(other.privateKey);
    expect(verifyFirebasePhoneToken(forged, project, keys)).rejects.toThrow();
  });
});

describe("customers cannot reach each other's data", () => {
  test("another customer's order and address are invisible and untouchable", async () => {
    const asha = await signIn("9845000010", "Asha");
    const ravi = await signIn("9845000011", "Ravi");
    const addr = (await asha("/me/addresses", { body: base })).json.address;
    const order = (await asha("/orders", { body: { lines: [{ itemId: dish("Paneer Butter Masala").id, qty: 2 }], addressId: addr.id, paymentMethod: "cod" } })).json.order;
    expect(order.id).toBeGreaterThan(0);

    expect((await ravi(`/orders/${order.id}`)).status).toBe(404);
    expect((await ravi(`/orders/${order.id}/cancel`, { body: {} })).status).toBe(404);
    expect((await ravi(`/orders/${order.id}/payment`, { body: { method: "cod" } })).status).toBe(404);
    expect((await ravi(`/me/addresses/${addr.id}`, { method: "PUT", body: base })).status).toBe(404);
    expect((await ravi(`/me/addresses/${addr.id}`, { method: "DELETE" })).status).toBe(404);
    const steal = await ravi("/orders", { body: { lines: [{ itemId: dish("Paneer Butter Masala").id, qty: 1 }], addressId: addr.id, paymentMethod: "cod" } });
    expect(steal.status).toBe(422);
    const list = (await ravi("/orders")).json.orders;
    expect(list.some((o: Json) => o.id === order.id)).toBe(false);
    expect((await asha(`/orders/${order.id}`)).status).toBe(200);
  });

  test("customers cannot use staff or owner endpoints", async () => {
    const c = await signIn("9845000012");
    for (const [path, method] of [["/staff/orders", "GET"], ["/staff/menu", "GET"], ["/staff/users", "GET"], ["/staff/settings", "PUT"]] as const) {
      const r = await c(path, method === "GET" ? {} : { method, body: {} });
      expect(r.status).toBe(401);
    }
  });

  test("staff who are not owners cannot change settings or the team", async () => {
    const owner = client();
    await owner("/staff/login", { body: { identifier: "9000000009", password: "owner-pass-123" } });
    await owner("/staff/users", { body: { name: "Counter Two", phone: "9000000021", password: "Mango-Lassi-2026" } });
    const staff = client();
    await staff("/staff/login", { body: { identifier: "9000000021", password: "Mango-Lassi-2026" } });
    expect((await staff("/staff/settings", { method: "PUT", body: {} })).status).toBe(403);
    expect((await staff("/staff/users")).status).toBe(403);
    expect((await staff("/staff/users", { body: { name: "Mallory", phone: "9000000022", password: "Mango-Lassi-2026", role: "owner" } })).status).toBe(403);
  });
});

describe("cross-site requests and malformed requests are refused", () => {
  test("a write from another website is blocked", async () => {
    const c = await signIn("9845000020");
    expect((await c("/me", { method: "PUT", body: { name: "Hacked" }, headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await c("/me", { method: "PUT", body: { name: "Hacked" }, headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await c("/me", { method: "PUT", body: { name: "Hacked" }, headers: { Origin: "null" } })).status).toBe(403);
    expect((await c("/me")).json.customer.name).not.toBe("Hacked");
  });

  test("with APP_ORIGINS set, only those origins may write", async () => {
    process.env.APP_ORIGINS = "https://order.ananth.example";
    try {
      const c = await signIn("9845000021");
      expect((await c("/me", { method: "PUT", body: { name: "Ok" }, headers: { Origin: "https://order.ananth.example" } })).status).toBe(200);
      expect((await c("/me", { method: "PUT", body: { name: "No" }, headers: { Origin: "http://localhost" } })).status).toBe(403);
    } finally {
      delete process.env.APP_ORIGINS;
    }
  });

  test("bodies must be JSON (a plain HTML form post is refused)", async () => {
    const c = await signIn("9845000022");
    expect((await c("/me", { method: "PUT", raw: '{"name":"Form"}', type: "text/plain" })).status).toBe(415);
    expect((await c("/me", { method: "PUT", raw: "name=Form", type: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await c("/me", { method: "PUT", raw: "{not json", type: "application/json" })).status).toBe(400);
  });

  test("oversized requests are refused", async () => {
    const c = await signIn("9845000023");
    const r = await c("/me", { method: "PUT", raw: JSON.stringify({ name: "x".repeat(40_000) }), type: "application/json" });
    expect(r.status).toBe(413);
  });
});

describe("brute force and flooding are rate limited", () => {
  test("five wrong staff passwords lock that account, even for the right password", { timeout: 30_000 }, async () => {
    const c = client();
    for (let i = 0; i < 5; i++) expect((await c("/staff/login", { body: { identifier: "9000000009", password: `wrong-${i}` } })).status).toBe(401);
    const locked = await client()("/staff/login", { body: { identifier: "9000000009", password: "owner-pass-123" } });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Unlock for the rest of the suite.
    await getDb().execute(sql`delete from rate_limits where key like 'staff-login-id:%'`);
  });

  test("one network guessing many accounts is stopped", { timeout: 30_000 }, async () => {
    const c = client("203.0.113.77");
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await c("/staff/login", { body: { identifier: `90000001${String(i).padStart(2, "0")}`, password: "Guess-1234" } })).status;
    expect(last).toBe(429);
  });

  test("customer sign-in attempts from one network are limited", async () => {
    const c = client("203.0.113.88");
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await c("/auth/dev-otp", { body: { phone: "9845000030", code: "000000" } })).status;
    expect(last).toBe(429);
  });

  test("one customer cannot flood the kitchen with orders", async () => {
    const c = await signIn("9845000031");
    const addr = (await c("/me/addresses", { body: base })).json.address;
    const order = { lines: [{ itemId: dish("Tomato Soup").id, qty: 1 }], addressId: addr.id, paymentMethod: "cod" };
    for (let i = 0; i < 6; i++) expect((await c("/orders", { body: order })).status).toBe(201);
    expect((await c("/orders", { body: order })).status).toBe(429);
  });
});

describe("hostile input is handled safely", () => {
  test("SQL injection in the staff login is just a failed login", async () => {
    for (const evil of ["' OR '1'='1", "admin'--", "x'; drop table staff; --", "\\'; select pg_sleep(5); --"]) {
      const r = await client()("/staff/login", { body: { identifier: evil, password: evil } });
      expect([401, 422]).toContain(r.status);
    }
    const ok = await client()("/staff/login", { body: { identifier: "9000000009", password: "owner-pass-123" } });
    expect(ok.status).toBe(200);
  });

  test("script and HTML in names, notes and addresses are stored as plain text", async () => {
    const xss = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    const c = await signIn("9845000040");
    expect((await c("/me", { method: "PUT", body: { name: xss.slice(0, 60) } })).status).toBe(200);
    const addr = (await c("/me/addresses", { body: { ...base, line1: `Flat 1 ${xss}`.slice(0, 200), landmark: xss.slice(0, 120) } })).json.address;
    const r = await c("/orders", { body: { lines: [{ itemId: dish("Tomato Soup").id, qty: 1 }], addressId: addr.id, paymentMethod: "cod", note: xss } });
    expect(r.status).toBe(201);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.json.order.note).toBe(xss); // returned verbatim as data; React renders it as text, never as HTML
  });

  test("impossible quantities, prices and shapes are refused", async () => {
    const c = await signIn("9845000041");
    const addr = (await c("/me/addresses", { body: base })).json.address;
    const id = dish("Tomato Soup").id;
    for (const lines of [[{ itemId: id, qty: 0 }], [{ itemId: id, qty: -3 }], [{ itemId: id, qty: 1.5 }], [{ itemId: id, qty: 51 }], [{ itemId: "1 or 1=1", qty: 1 }], Array.from({ length: 61 }, () => ({ itemId: id, qty: 1 }))]) {
      expect((await c("/orders", { body: { lines, addressId: addr.id, paymentMethod: "cod" } })).status).toBe(422);
    }
    // A price sent by the browser is ignored: the server prices from the menu.
    const r = await c("/orders", { body: { lines: [{ itemId: id, qty: 1, unitPricePaise: 1 }], addressId: addr.id, paymentMethod: "cod", totalPaise: 1 } });
    expect(r.json.order.subtotalPaise).toBe(dish("Tomato Soup").pricePaise);
  });

  test("an order above the online limit is refused before it reaches the database", async () => {
    const c = await signIn("9845000042");
    const addr = (await c("/me/addresses", { body: base })).json.address;
    const lines = menuItems.filter((i) => i.variants.length === 0).slice(0, 30).map((i) => ({ itemId: i.id, qty: 50 }));
    const r = await c("/orders", { body: { lines, addressId: addr.id, paymentMethod: "cod" } });
    expect(r.status).toBe(422);
    expect(r.json.error).toContain("Call the restaurant");
  });

  test("prototype pollution payloads have no effect", async () => {
    const c = await signIn("9845000043");
    await c("/me", { method: "PUT", raw: '{"name":"Safe","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}', type: "application/json" });
    expect(({} as Json).polluted).toBeUndefined();
  });

  test("non-numeric ids are not found, never an error", async () => {
    const c = await signIn("9845000044");
    for (const bad of ["abc", "1;drop", "-1", "0", "99999999999"]) expect((await c(`/orders/${bad}`)).status).toBe(404);
  });

  test("the sign-in redirect only goes to pages on this site", () => {
    for (const ok of ["/orders", "/orders/12", "/checkout?step=2"]) expect(safeNextPath(ok)).toBe(ok);
    for (const evil of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/<script>", "", null]) expect(safeNextPath(evil)).toBe("/");
  });

  test("weak staff passwords are refused", async () => {
    expect(passwordProblem("password123")).not.toBeNull();
    expect(passwordProblem("aaaaaaaa")).not.toBeNull();
    expect(passwordProblem("Pass-845012345", { phone: "+919845012345" })).not.toBeNull();
    expect(passwordProblem("Lakshmi@2026", { name: "Lakshmi R" })).not.toBeNull();
    expect(passwordProblem("Tw1light-Kitchen-9", { name: "Lakshmi", phone: "+919845012345" })).toBeNull();
    const owner = client();
    await owner("/staff/login", { body: { identifier: "9000000009", password: "owner-pass-123" } });
    const r = await owner("/staff/users", { body: { name: "Weak", phone: "9000000030", password: "12345678" } });
    expect(r.status).toBe(422);
  });
});

describe("payments cannot be faked", () => {
  const secret = "whsec_test_secret_value";
  const sign = (raw: string) => createHmac("sha256", secret).update(raw).digest("hex");

  test("forged and malformed Razorpay webhooks are refused; a genuine one marks the order paid", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "rzp_secret_x";
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    try {
      const c = await signIn("9845000050");
      const addr = (await c("/me/addresses", { body: base })).json.address;
      const placed = (await c("/orders", { body: { lines: [{ itemId: dish("Tomato Soup").id, qty: 1 }], addressId: addr.id, paymentMethod: "cod" } })).json.order;
      // Turn it into an unpaid online order directly (creating a real Razorpay order needs their API).
      await getDb().update(orders).set({ status: "pending_payment", paymentMethod: "online", razorpayOrderId: "order_TEST123" }).where(eq(orders.id, placed.id));

      const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_TEST1", order_id: "order_TEST123" } } } });
      const hook = (raw: string, signature: string) =>
        app.request("/api/payments/razorpay/webhook", { method: "POST", headers: { Host: "localhost", "Content-Type": "application/json", "X-Razorpay-Signature": signature }, body: raw });

      expect((await hook(event, "0".repeat(64))).status).toBe(401);
      expect((await hook(event, "not-a-signature")).status).toBe(401);
      expect((await hook(event.replace("pay_TEST1", "pay_EVIL"), sign(event))).status).toBe(401);
      expect((await hook("{broken", sign("{broken"))).status).toBe(400);
      expect((await c(`/orders/${placed.id}`)).json.order.paymentStatus).toBe("pending");

      // A fake "payment succeeded" from the browser is rejected too.
      const fake = await c("/payments/razorpay/verify", { body: { orderId: placed.id, razorpay_order_id: "order_TEST123", razorpay_payment_id: "pay_x", razorpay_signature: "f".repeat(64) } });
      expect(fake.status).toBe(422);

      expect((await hook(event, sign(event))).status).toBe(200);
      const after = (await c(`/orders/${placed.id}`)).json.order;
      expect(after).toMatchObject({ paymentStatus: "paid", status: "new" });
    } finally {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });
});

describe("responses and pages carry protective headers", () => {
  test("API responses cannot be framed, sniffed, cached or read cross-site", async () => {
    const r = await client()("/menu");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("errors never expose internals", async () => {
    const r = await client()("/nope");
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.json)).not.toMatch(/stack|at .*\.ts|postgres|drizzle/i);
  });

  test("the site's Content Security Policy blocks injected scripts and framing", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const all = vercel.headers.find((h: Json) => h.source === "/(.*)").headers as { key: string; value: string }[];
    const get = (k: string) => all.find((h) => h.key === k)?.value ?? "";
    const csp = get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Permissions-Policy")).toContain("camera=()");
  });
});

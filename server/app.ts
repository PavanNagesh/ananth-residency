import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { getDb } from "./db/index.js";
import { orders } from "./db/schema.js";
import { env } from "./env.js";
import { HttpError, type AppEnv } from "./http.js";
import { verifyWebhookSignature } from "./razorpay.js";
import { customerRoutes, markOrderPaid } from "./routes/customer.js";
import { staffRoutes } from "./routes/staff.js";
import { publicMenu } from "./services.js";

export const app = new Hono<AppEnv>().basePath("/api");

app.use(
  secureHeaders({
    // The API returns JSON only: nothing may frame, embed or run it.
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    crossOriginResourcePolicy: "same-origin",
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);
app.use(async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

// No request body larger than 32 KB (the largest real one, a full cart, is a few KB).
app.use(
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => c.json({ error: "That request is too large.", fields: null }, 413),
  }),
);

/**
 * Cross-site request forgery protection for cookie-authenticated writes, three ways:
 * 1. Sec-Fetch-Site (set by every current browser, cannot be forged by a page) must not be cross-site.
 * 2. Origin, when present, must be this site: APP_ORIGINS if configured, else the host the API is served on.
 * 3. Bodies must be JSON (see body()), and session cookies are SameSite.
 * The Razorpay webhook is exempt: it comes from Razorpay's servers and is verified by signature.
 */
app.use(async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !c.req.path.startsWith("/api/payments/razorpay/webhook")) {
    const blocked = () => new HttpError(403, "This request came from another site and was blocked.");
    if (c.req.header("Sec-Fetch-Site") === "cross-site") throw blocked();
    const origin = c.req.header("Origin");
    if (origin) {
      let parsed: URL | null = null;
      try {
        parsed = new URL(origin);
      } catch {
        throw blocked();
      }
      const allowed = env.appOrigins;
      if (allowed.length) {
        if (!allowed.includes(parsed.origin)) throw blocked();
      } else {
        const host = c.req.header("X-Forwarded-Host") ?? c.req.header("Host");
        if (!host || parsed.host !== host) throw blocked();
      }
    }
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/menu", async (c) => c.json(await publicMenu(getDb())));

app.route("/", customerRoutes);
app.route("/staff", staffRoutes);

/** Razorpay webhook (payment.captured / order.paid): backup for the browser verify call. */
app.post("/payments/razorpay/webhook", async (c) => {
  const secret = env.razorpay?.webhookSecret;
  if (!secret) throw new HttpError(503, "Webhook not configured.");
  const raw = await c.req.text();
  const signature = c.req.header("X-Razorpay-Signature") ?? "";
  if (!/^[a-f0-9]{64}$/.test(signature) || !verifyWebhookSignature(secret, raw, signature)) throw new HttpError(401, "Invalid signature.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Malformed webhook body.");
  }
  const event = parsed as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string } } };
  };
  const payment = event.payload?.payment?.entity;
  if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id) {
    const [row] = await getDb().select({ id: orders.id }).from(orders).where(eq(orders.razorpayOrderId, payment.order_id));
    if (row) await markOrderPaid(row.id, payment.id);
  }
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const { _retryAfter, ...fields } = err.fields ?? {};
    if (_retryAfter) c.header("Retry-After", _retryAfter);
    return c.json({ error: err.message, fields: Object.keys(fields).length ? fields : null }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
});

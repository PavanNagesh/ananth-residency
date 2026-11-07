import { eq } from "drizzle-orm";
import { Hono } from "hono";
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

app.use(secureHeaders());
app.use(async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

// Cross-site request protection for cookie-authenticated writes: browsers always send
// Origin on POST/PUT/PATCH/DELETE; it must match the host the API is served from.
app.use(async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && !c.req.path.startsWith("/api/payments/razorpay/webhook")) {
    const origin = c.req.header("Origin");
    if (origin) {
      const host = c.req.header("X-Forwarded-Host") ?? c.req.header("Host");
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (!host || originHost !== host) throw new HttpError(403, "This request came from another site and was blocked.");
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
  if (!verifyWebhookSignature(secret, raw, signature)) throw new HttpError(401, "Invalid signature.");
  const event = JSON.parse(raw) as {
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
    return c.json({ error: err.message, fields: err.fields ?? null }, err.status);
  }
  console.error(err);
  return c.json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
});

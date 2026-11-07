import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.js";

type Keys = { keyId: string; keySecret: string };

/** Creates a Razorpay order (https://razorpay.com/docs/api/orders/create/). */
export async function createRazorpayOrder(keys: Keys, amountPaise: number, receipt: string, notes: Record<string, string>) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new HttpError(502, "We could not start the online payment. Try again, or choose pay on delivery.");
  }
  const data = (await res.json()) as { id: string; amount: number };
  return data;
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout success signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(secret: string, orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

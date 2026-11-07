/** Environment access in one place, read at call time (tests set env before first use). */
export const env = {
  get sessionSecret(): Uint8Array {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 24) throw new Error("SESSION_SECRET must be set to at least 24 characters.");
    return new TextEncoder().encode(s);
  },
  get isProduction(): boolean {
    return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  },
  get secureCookies(): boolean {
    return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  },
  get firebaseProjectId(): string | undefined {
    return process.env.FIREBASE_PROJECT_ID || undefined;
  },
  /** Fixed-code sign-in for local development. Never honoured on a production deployment. */
  get devOtpEnabled(): boolean {
    return process.env.DEV_OTP === "true" && process.env.VERCEL_ENV !== "production";
  },
  get razorpay(): { keyId: string; keySecret: string; webhookSecret?: string } | null {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || undefined };
  },
};

export const DEV_OTP_CODE = "123456";

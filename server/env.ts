/** Environment access in one place, read at call time (tests set env before first use). */

/** Values that must never reach a real deployment (from .env.example and local development). */
const PLACEHOLDER_SECRETS = [/replace-with/i, /^local-dev-secret/i, /^test-secret/i, /^changeme/i];

export const env = {
  /** Any deployed environment: Vercel (production or preview) or NODE_ENV=production elsewhere. */
  get isDeployed(): boolean {
    return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  },
  get isProduction(): boolean {
    return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  },
  get sessionSecret(): Uint8Array {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 24) throw new Error("SESSION_SECRET must be set to at least 24 characters.");
    if (env.isDeployed && (s.length < 32 || PLACEHOLDER_SECRETS.some((re) => re.test(s)))) {
      throw new Error("SESSION_SECRET is a placeholder or too short for a deployment. Set a random value of 32+ characters.");
    }
    return new TextEncoder().encode(s);
  },
  get secureCookies(): boolean {
    return env.isDeployed;
  },
  get firebaseProjectId(): string | undefined {
    return process.env.FIREBASE_PROJECT_ID || undefined;
  },
  /**
   * Fixed-code sign-in for local development only. Refused on every Vercel deployment
   * (production AND preview) and whenever NODE_ENV=production, even if DEV_OTP is set.
   */
  get devOtpEnabled(): boolean {
    return process.env.DEV_OTP === "true" && !env.isDeployed;
  },
  /**
   * Trust X-Forwarded-For for the client IP. Vercel overwrites that header with the real
   * address, so it is safe there; elsewhere only when TRUST_PROXY=true (a known proxy in front).
   */
  get trustProxy(): boolean {
    return Boolean(process.env.VERCEL) || process.env.TRUST_PROXY === "true";
  },
  /** Optional exact list of site origins allowed to make writes (comma separated), e.g. https://order.ananth.in */
  get appOrigins(): string[] {
    return (process.env.APP_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
  },
  get razorpay(): { keyId: string; keySecret: string; webhookSecret?: string } | null {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || undefined };
  },
};

export const DEV_OTP_CODE = "123456";

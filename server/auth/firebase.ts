import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Google's public keys for Firebase Auth ID tokens. jose caches and rotates them.
const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

/** A sign-in must use a token minted just now by an SMS code check, not an old one replayed. */
export const MAX_SIGN_IN_AGE_SECONDS = 10 * 60;

/**
 * Verifies a Firebase ID token without the Admin SDK and returns the verified phone number.
 * Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 * `keys` is replaceable so tests can sign their own tokens.
 */
export async function verifyFirebasePhoneToken(idToken: string, projectId: string, keys: JWTVerifyGetKey = GOOGLE_KEYS) {
  if (idToken.length > 4096) throw new Error("Token too long.");
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
    clockTolerance: 60,
  });
  const phone = typeof payload.phone_number === "string" ? payload.phone_number : null;
  if (!payload.sub || payload.sub.length > 128 || !phone) throw new Error("Token has no verified phone number.");
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Only Indian mobile numbers can sign in.");
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
  const now = Date.now() / 1000;
  if (authTime > now + 60) throw new Error("Token auth_time is in the future.");
  if (now - authTime > MAX_SIGN_IN_AGE_SECONDS) throw new Error("Sign-in is too old. Request a new code.");
  return { uid: payload.sub, phone };
}

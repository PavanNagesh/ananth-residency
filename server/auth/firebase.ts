import { createRemoteJWKSet, jwtVerify } from "jose";

// Google's public keys for Firebase Auth ID tokens. jose caches and rotates them.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

/**
 * Verifies a Firebase ID token without the Admin SDK and returns the verified phone number.
 * Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
export async function verifyFirebasePhoneToken(idToken: string, projectId: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  const phone = typeof payload.phone_number === "string" ? payload.phone_number : null;
  if (!payload.sub || !phone) throw new Error("Token has no verified phone number.");
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
  if (authTime * 1000 > Date.now() + 60_000) throw new Error("Token auth_time is in the future.");
  return { uid: payload.sub, phone };
}
